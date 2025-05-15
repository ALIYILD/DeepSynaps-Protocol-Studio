# Behavioural Risk Markers in Digital Phenotyping
## Clinical Risk Research Compendium

**Document version:** 1.0  
**Scope:** Longitudinal behavioural instability, relapse markers, and adherence indicators  
**Methodology:** Evidence synthesis from peer-reviewed literature (2019-2025)  
**Constraint:** No autonomous crisis prediction claims. All findings are framed as research evidence, not clinical guidance.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Social Withdrawal (Reduced Communication)](#2-social-withdrawal-reduced-communication)
3. [Circadian Disruption (Irregular Sleep)](#3-circadian-disruption-irregular-sleep)
4. [Mobility Reduction](#4-mobility-reduction)
5. [Behavioural Activation Decline](#5-behavioural-activation-decline)
6. [Adherence Drop-off](#6-adherence-drop-off)
7. [Communication Entropy Change](#7-communication-entropy-change)
8. [Routine Disruption](#8-routine-disruption)
9. [Activity Transition Reduction](#9-activity-transition-reduction)
10. [Cross-Cutting Considerations](#10-cross-cutting-considerations)
11. [Evidence Summary Matrix](#11-evidence-summary-matrix)
12. [Limitations and Research Gaps](#12-limitations-and-research-gaps)
13. [References](#13-references)

---

## 1. Executive Summary

Digital phenotyping -- the collection and analysis of passive smartphone and wearable sensor data -- has emerged as a promising research domain for identifying behavioural markers associated with psychiatric symptom change, relapse risk, and behavioural deterioration. This document synthesises evidence for eight candidate behavioural risk markers derived from digital data streams.

### Key Principle: Research-Only Framing

All markers documented herein are presented as **research findings** with associated uncertainty levels. None of these markers are validated for independent clinical decision-making. Any application requires integration with clinical assessment, participant self-report, and contextual interpretation. The document explicitly avoids language that could be construed as claiming autonomous predictive capability.

### Domains Covered

| Marker | Primary Data Streams | Evidence Base |
|--------|---------------------|---------------|
| Social withdrawal | Call/SMS logs, app usage | Multiple studies, moderate-to-strong |
| Circadian disruption | Sleep timing, GPS patterns, HR | Multiple studies, moderate-to-strong |
| Mobility reduction | GPS, accelerometer, step count | Systematic review, strong |
| Behavioural activation decline | Activity levels, GPS movement | Moderate, therapy-adjacent evidence |
| Adherence drop-off | Survey completion, sensor compliance | Moderate, feasibility literature |
| Communication entropy | Shannon entropy of call/text patterns | Emerging, moderate |
| Routine disruption | Regularity indices, routine index | Emerging, moderate |
| Activity transition reduction | GPS transition metrics | Emerging, moderate |

---

## 2. Social Withdrawal (Reduced Communication)

### 2.1 Definition and Operationalisation

Social withdrawal in digital phenotyping refers to measurable reductions in communication frequency, duration, diversity, and reciprocity as inferred from smartphone call logs, SMS records, social media app usage, and Bluetooth-based proximity detection. This marker captures the behavioural signature of social disengagement that has long been recognised as a core feature of depression, social anxiety, and psychotic disorders.

### 2.2 Evidence Summary

**Zhan et al. (2025)** conducted a digital phenotyping study of depression using smartphone passive sensing and wearable devices. Key findings included:

- Lower outgoing call frequency correlated with higher Montgomery-Asberg Depression Rating Scale (MADRS) scores (r = -0.31, p < .001)
- Decreased text message frequency associated with higher depression severity (r = -0.35, p < .001)
- Reduced social media app usage associated with higher MADRS scores (r = -0.38, p < .001)
- The diversity of social contacts (number of unique individuals contacted) showed the strongest relationship with depression severity (r = -0.43, p < .001)

**Beiwinkel et al.** in the SIMBA bipolar disorder study found that decreased activity of social communication (e.g., outgoing text messages) predicted an increase in clinical depressive symptomatology (p < 0.001). Conversely, higher social communication could predict levels of clinical manic symptoms.

**Henson et al. (2020-2021)** studied digital phenotyping in schizophrenia and found that passive data features related to sociality showed Spearman correlations with symptoms ranging from rho = -0.23 to -0.30 (p < .001). Their model achieved 89% sensitivity and 75% specificity in predicting symptom relapse.

**Jacobson et al.** demonstrated that smartphone sensor data can predict social anxiety severity using machine learning with strong discriminant validity, with lower activity levels captured by smartphone data being effective predictors.

**Faurholt-Jepsen et al.** observed that social activity patterns (distance traveled, frequency of conversation) can be used to infer rhythmicity, a key marker of wellbeing for individuals with bipolar disorder.

### 2.3 Evidence Strength: MODERATE-TO-STRONG

The association between reduced digital communication and depression severity has been replicated across multiple independent studies using diverse samples (depression, bipolar disorder, schizophrenia, social anxiety). Effect sizes range from small-to-medium (r ~0.3) to medium (r ~0.43 for social diversity). The direction of association is consistent across studies.

### 2.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research suggests that reduced communication frequency and diversity have been associated with higher depression symptom severity in some studies."
- "Lower outgoing call and text message frequency has been correlated with elevated depression scores in observational research."
- "Social contact diversity metrics derived from communication logs have shown the strongest association with depression severity among communication-based digital phenotypes, though this is based on correlational evidence."

**Uncertainty level: MEDIUM.** While the direction and magnitude of associations are relatively consistent, causality is unestablished. Social withdrawal may be both a contributor to and a consequence of mood deterioration. Individual baseline variation in communication patterns is substantial. Cultural and demographic factors (age, socioeconomic status, baseline social network size) moderate these relationships.

### 2.5 Measurement Considerations

- Call and SMS frequency are straightforward to extract but may not capture communication through internet-based messaging platforms (WhatsApp, Telegram, etc.)
- Contact diversity (unique individuals contacted) appears more strongly associated with depression than total communication volume
- The asymmetry between incoming and outgoing communications (as captured by asymmetry and skewness coefficients using Shannon entropy) may provide additional signal
- Missed call rates and their variance may also be informative

---

## 3. Circadian Disruption (Irregular Sleep)

### 3.1 Definition and Operationalisation

Circadian disruption refers to disturbances in the regularity and timing of sleep-wake cycles and daily activity rhythms. In digital phenotyping, this is measured through: (a) sleep timing variability (sleep onset, wake time, sleep duration) from wearable actigraphy or phone screen on/off patterns; (b) circadian movement regularity from GPS location patterns; and (c) heart rate variability during sleep.

### 3.2 Evidence Summary

**Zhan et al. (2025)** found that sleep irregularity -- quantified as night-to-night variability in sleep timing -- demonstrated a strong positive correlation with MADRS depression scores (r = 0.40, p < .001). Both decreased deep sleep percentage (r = -0.34) and increased wake after sleep onset (r = 0.37) were significantly associated with depression severity. Total sleep duration showed a U-shaped relationship, with both short and long sleep duration associated with higher depression scores.

**Wulff et al.** found significant sleep/circadian disruptions in outpatients with schizophrenia compared to controls, with half displaying severe circadian misalignment in melatonin cycles. This finding has been corroborated by work showing that melatonin irregularities may represent a potential treatment target in schizophrenia.

**Cho et al. (2020)** studied circadian rhythm monitoring (CRM) using wearable data (activity, sleep, heart rate) combined with smartphone-collected data in patients with mood disorders. The CRM group showed 96.7% fewer total depressive episodes per year (p = .03) and 99.5% shorter depressive episodes (p < .001) compared to the non-CRM group, suggesting that circadian rhythm monitoring and feedback can substantially impact mood episode frequency and duration.

**Meyerhoff et al. (2021)** investigated circadian rhythm extracted from GPS mobility patterns and found that in participants with bipolar disorder, circadian rhythm was associated with changes in anxiety; a higher circadian rhythm was associated with an increase in anxiety and a lower circadian rhythm was associated with a decrease in anxiety at later time points.

**Tseng et al.** combined active (mood and sleep) and passive data (activity) to demonstrate real-time monitoring and prediction of symptom changes in bipolar disorder patients using smartphone apps, with circadian features playing a central role.

**Medrxiv (2025)** work on "Unobtrusive inference of circadian rhythms from smartphone data" notes that circadian rhythms are disrupted in many forms of psychopathology including major depressive disorder, schizophrenia, and bipolar disorder, with evening chronotype conferring added risk for depressive and manic symptoms.

### 3.3 Evidence Strength: MODERATE-TO-STRONG

Sleep and circadian markers are among the most widely studied digital phenotypes. Multiple independent studies have found significant associations between circadian disruption and mood disorder severity, with effect sizes ranging from medium (r ~0.3-0.4) to large in intervention studies. The Cho et al. findings of dramatically reduced mood episodes through CRM provide particularly compelling support.

### 3.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research has found associations between increased night-to-night variability in sleep timing and higher depression symptom scores in observational studies."
- "Circadian rhythm metrics derived from GPS mobility patterns have been associated with changes in anxiety symptoms in some research participants with bipolar disorder."
- "Sleep irregularity has shown consistent associations with depression severity across multiple studies, though individual sleep patterns vary considerably."

**Uncertainty level: MEDIUM-LOW.** Sleep and circadian markers have the strongest and most replicated evidence base among digital phenotypes. However, the relationship between circadian disruption and psychiatric symptoms is likely bidirectional, and individual chronotype variation complicates interpretation. Sleep changes can also be caused by non-psychiatric factors (medication, physical illness, lifestyle changes).

### 3.5 Measurement Considerations

- Sleep metrics derived from wearables (Fitbit, Apple Watch, Oura) are more accurate than phone-based proxies but require higher participant burden
- Phone screen on/off patterns can approximate sleep timing but are confounded by nighttime phone use
- GPS-derived circadian rhythm (regularity of location changes in 24-hour cycles) provides an additional complementary signal
- The U-shaped relationship between sleep duration and depression means both short and long sleep are relevant signals

---

## 4. Mobility Reduction

### 4.1 Definition and Operationalisation

Mobility reduction refers to decreases in the distance traveled, location diversity, time spent outside the home, and overall movement patterns. Key metrics include: radius of gyration, location entropy, time spent at home, maximum distance from home, total distance traveled, number of unique locations visited, and location variance.

### 4.2 Evidence Summary

**A systematic review and meta-analysis (JMIR, 2026)** on GPS mobility metrics and depressive symptoms concluded that mobility features are among the most reliable digital phenotypes for depression. Across studies, reduced mobility (lower distance traveled, less location diversity, more time at home) has been consistently associated with higher depression severity.

**Laiou et al. (2022)** studied movement and social activities in major depressive disorder using GPS and incoming/outgoing calls over 2 years. They found that more time spent at home was associated with more severe symptoms on weekdays (95% CI 0.023-0.178), with a median home stay of 20.9 hours per day among symptomatic participants.

**Canzian and Musolesi** attempted to predict depressive states by analyzing mobility behaviour, demonstrating that mobility patterns combined with depressed mood could predict the status of patients with mood disorders.

**Chikersal et al. (2021)** conducted a study on college students and found that a model incorporating location patterns (along with Bluetooth, calls, phone use, steps, and sleep) could predict post-semester depressive symptoms with 85.7% accuracy and 85.4% symptom severity detection, 11-15 weeks in advance.

**Meyerhoff et al. (2021)** found that changes in depression were predicted by changes in GPS features including Time (r = -0.23, p = .02), locations (r = -0.36, p < .001), and exercise duration (r = 0.39, p = .03). Importantly, changes in sensor-derived behavioural characteristics were associated with subsequent changes in depression, suggesting a unidirectional relationship in which detected behaviour changes precede symptom changes.

**Beiwinkel et al.** found that lower physical activity (e.g., distance travelled) and decline in cell tower movements could predict an increase in clinical depressive symptomatology (p = 0.03).

**Faurholt-Jepsen et al.** observed reduced mobility patterns during depressive states in bipolar disorder, while higher mobility levels were associated with higher levels of mania.

### 4.3 Evidence Strength: STRONG

Mobility reduction is among the most robustly supported behavioural markers in digital phenotyping. The systematic review and meta-analysis literature confirms consistent associations across multiple studies, clinical populations, and geographic settings. The prospective predictive value (Chikersal et al.) adds strength to the evidence.

### 4.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research has consistently found that reduced mobility metrics (such as distance traveled and time outside home) have been associated with higher depression symptom severity."
- "GPS-derived mobility features have shown associations with depressive symptoms in systematic reviews of the literature."
- "Changes in GPS mobility features have been found to precede changes in depression scores in some longitudinal studies, though the predictive value at the individual level remains uncertain."

**Uncertainty level: LOW-MEDIUM.** Mobility markers are among the most replicated findings. However, mobility is strongly influenced by contextual factors (employment status, physical health, weather, urban density, cultural norms, COVID-19 restrictions) that must be accounted for in interpretation.

### 4.5 Measurement Considerations

- GPS sampling frequency matters: higher frequency enables more accurate mobility inference
- Location entropy (diversity of locations visited) appears more informative than simple distance metrics
- Time spent at home is a robust but coarse measure; combining with location diversity provides better signal
- Radius of gyration captures the spatial spread of movement and is well-validated
- Urban vs. rural settings substantially affect baseline mobility patterns

---

## 5. Behavioural Activation Decline

### 5.1 Definition and Operationalisation

Behavioural activation decline refers to reductions in goal-directed activities, pleasure-seeking behaviours, and overall engagement with daily activities. This concept is rooted in behavioural activation (BA) theory, which posits that reduced engagement in reinforcing activities perpetuates depressive states. Digital markers include: decreased step count, reduced number of app categories used, lower frequency of recreational app usage, decreased visit frequency to places associated with leisure or social activities, and reduced overall physical activity.

### 5.2 Evidence Summary

**Behavioural activation theory** provides a strong theoretical framework. A narrative review of empirical literature on BA treatment for depression (PMC9082162) found that activity scheduling as a common treatment component showed large effect sizes (Cohen's d = 0.87) compared to control conditions. BA has been found to be as effective as cognitive therapy for depression and more effective for moderate-to-severe depression.

**Chikersal et al. (2021)** found that a combination of features including Bluetooth-based social proximity, call patterns, location patterns, phone use, steps, and sleep could predict depressive symptoms with >80% accuracy. Steps and activity-related features were among the core predictors.

**Zhang et al. (2024)** analyzed wearable-derived physical activity, heart rate, and sleep patterns in a large sample, successfully identifying markers of depression and anxiety and demonstrating the scalability of wearable-based digital phenotyping.

**Song et al.** conducted a pilot study with older adults showing that daily depressive symptoms could be predicted through wearable-derived heart rate variability, sleep quality, and physical activity data.

**Cho et al. (2020)** demonstrated that continuous monitoring of activity patterns combined with circadian rhythm data enabled prediction of mood over 3-day windows.

**Tseng et al.** combined active and passive data (including activity) to demonstrate real-time monitoring and prediction of symptom changes in bipolar disorder patients.

### 5.3 Evidence Strength: MODERATE

The theoretical basis for behavioural activation decline as a marker is strong, supported by decades of behavioural psychology research. Digital phenotyping evidence specifically linking activity decline to mood changes is growing but less extensive than mobility or sleep markers. Most evidence comes from combined-feature models rather than activity-specific analyses.

### 5.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research suggests that reduced physical activity and engagement may be associated with elevated depressive symptoms, consistent with behavioural activation theory."
- "Lower step counts and decreased recreational activity patterns have been correlated with higher depression scores in some observational studies."
- "Behavioural engagement metrics have been included in multimodal prediction models for mood changes, though their independent contribution is difficult to isolate."

**Uncertainty level: MEDIUM.** While the theoretical basis is robust, digital measurement of "behavioural activation" is indirect. Step count and physical activity are imperfect proxies for the broader construct of engagement in reinforcing activities. The evidence is also confounded by the close relationship between physical activity and mobility markers.

### 5.5 Measurement Considerations

- Step count from accelerometers is the most common proxy but misses non-walking activities
- The diversity of apps used (productivity, social, entertainment) may reflect behavioural engagement breadth
- Combining activity data with location context (e.g., visits to recreational venues) may improve signal
- Weekday vs. weekend activity patterns may carry differential information
- Baseline activity levels vary substantially across individuals, requiring personalised reference points

---

## 6. Adherence Drop-off

### 6.1 Definition and Operationalisation

Adherence drop-off refers to declining engagement with data collection protocols, including reduced survey completion rates, decreased passive sensor data quality, and disengagement from digital intervention platforms. Paradoxically, adherence drop-off itself may serve as a behavioural marker of clinical deterioration, as symptom worsening may reduce motivation and capacity to engage with study or treatment protocols.

### 6.2 Evidence Summary

**Buck et al. (2021, PMC8192468)** studied digital phenotyping adherence in outpatients with schizophrenia and healthy controls. Key findings:

- Active (survey) adherence in schizophrenia patients: 63.77% (SD 34.12%)
- Active adherence in controls: 75.3% (SD 28.71%)
- Passive accelerometer adherence in schizophrenia: 86.65%
- Passive GPS adherence in schizophrenia: 72.65%
- Passive voice recording adherence in schizophrenia: 39.69%
- Wearable (band) adherence in schizophrenia: 19.97%

These findings indicate substantially lower adherence for active data collection methods and wearables compared to passive smartphone sensors in schizophrenia populations.

**The SHARP study (Nature, 2023)** found that complementing active data (psychosis surveys, medication adherence surveys) with passive data and data quality metrics improved predictive power for schizophrenia relapse by a quantitatively measurable factor of 1.41 times. Data quality metrics themselves contributed meaningful signal.

**The Bangladesh TRANSFORM study (PMC12872212)** is using a combination of passive data (screen time, mobility, call/text frequency) with monthly active assessments to predict relapse, explicitly incorporating data quality as a feature in their machine learning models.

**Henson et al. (2021)** incorporated data quality metrics into their schizophrenia relapse prediction model, finding that data quality combined with passive features improved sensitivity to 89%.

### 6.3 Evidence Strength: MODERATE

Adherence metrics as behavioural markers are supported by feasibility literature showing that adherence differs between clinical and healthy populations and that adherence changes over time may signal clinical change. The SHARP study's finding that data quality metrics improve prediction adds support. However, adherence is also influenced by non-clinical factors (technical issues, life circumstances, motivation).

### 6.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research has found that engagement with data collection protocols tends to be lower among individuals with schizophrenia compared to healthy controls."
- "Declining adherence to digital monitoring has been associated with clinical populations and may co-occur with symptom changes, though multiple factors influence adherence."
- "Data quality metrics have been found to contribute incremental predictive value in some relapse prediction models, but the causal relationship between adherence decline and clinical deterioration is unclear."

**Uncertainty level: MEDIUM-HIGH.** Adherence is influenced by many factors unrelated to mental health status (technical literacy, device issues, competing priorities). The direction of causality is ambiguous: does adherence drop because of symptom worsening, or does non-adherence lead to missed interventions? Longitudinal evidence linking within-individual adherence changes to subsequent clinical outcomes is limited.

### 6.5 Measurement Considerations

- Passive sensor adherence is generally higher than active survey adherence
- Adherence may be most informative when tracked longitudinally within individuals rather than compared across individuals
- The rate of adherence decline (slope over time) may be more informative than absolute adherence levels
- Different data streams have different baseline adherence rates; decline in any single stream may be less informative than coordinated decline across multiple streams
- Adherence drop-off may be a particularly relevant marker in the context of digital therapeutic interventions

---

## 7. Communication Entropy Change

### 7.1 Definition and Operationalisation

Communication entropy refers to changes in the variability, unpredictability, and distribution patterns of communication behaviours. This includes: Shannon entropy of incoming vs. outgoing call/text distributions (asymmetry and skewness coefficients), entropy of phone usage timing (irregularity of screen unlock patterns), and entropy of app usage patterns (diversity and irregularity of app engagement over time).

### 7.2 Evidence Summary

**Zhan et al. (2025)** found that the entropy of phone usage (distribution of usage across the day) showed a negative correlation with depression severity (r = -0.32, p < .001), suggesting that more irregular phone usage patterns were associated with worse depression. The direction indicates that less predictable, more fragmented usage patterns are associated with higher symptom severity.

**The smartphone sensing for depression study (JMIR, 2026)** found that:
- SD of app frequency entropy was associated with depression severity (r = -0.19)
- When included in regression models, SD of app frequency entropy explained 2.81% of the variance in depression severity
- In combined models with EMA and other sensing features, app frequency entropy remained a significant predictor (beta = -0.17)
- Location routine index (regularity of location patterns) also showed associations (r = 0.23)

**Karam et al. (Nature, 2024)** used communication log features including:
- Asymmetry coefficient (AC) = (outgoing - incoming) / (outgoing + incoming)
- Skewness coefficient (SC) incorporating Shannon entropy of communication direction
- These entropy-based communication metrics were associated with depression severity in their sample
- Conversational network size inferred from audio data was significantly correlated with location-based entropy features

**Meyerhoff et al. (2021)** found that normalized entropy of GPS location data (measuring distribution of time across different location clusters) was associated with depression symptom changes. Changes in depression were predicted by changes in GPS features including entropy metrics.

**Stange et al.** research on baseline depression affecting GPS-based indices over follow-up periods found that normalized entropy of location distribution was among the affected metrics, demonstrating that entropy measures capture clinically relevant behavioural variation.

### 7.3 Evidence Strength: MODERATE

Entropy-based metrics represent a more sophisticated analytical approach than simple frequency counts. The evidence base is smaller but growing. Effect sizes are typically small-to-medium (r ~0.2-0.3). The conceptual advantage is that entropy captures pattern disruption rather than just magnitude change.

### 7.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research suggests that increased irregularity in phone usage patterns has been associated with higher depression scores in some studies."
- "Entropy-based metrics capturing variability in app usage and communication patterns have shown small-to-medium associations with depression severity."
- "Changes in the predictability of digital behaviour patterns have been explored as potential markers of mood changes, though evidence remains preliminary."

**Uncertainty level: MEDIUM.** Entropy metrics are analytically attractive but methodologically complex. Different entropy calculations (Shannon entropy, normalised entropy, frequency entropy) may capture different aspects of behaviour. The clinical interpretability of entropy changes is less direct than frequency-based metrics. Replication across larger and more diverse samples is needed.

### 7.5 Measurement Considerations

- Shannon entropy of incoming vs. outgoing communication captures reciprocity patterns
- Normalised entropy adjusts for the number of states and enables between-individual comparison
- App usage entropy captures the diversity and irregularity of digital engagement
- GPS location entropy captures the diversity of places visited
- Screen unlock entropy captures the regularity of phone engagement timing
- Entropy changes may be more informative when compared to individual baselines rather than population norms

---

## 8. Routine Disruption

### 8.1 Definition and Operationalisation

Routine disruption refers to breakdowns in the regularity and predictability of daily behavioural patterns. This includes: irregularity in app usage timing (app regularity index), disrupted location visit patterns (location routine index), variable screen on/off timing (screen regularity index), and overall disruption in the temporal structure of daily activities.

### 8.2 Evidence Summary

**The smartphone sensing for depression study (JMIR, 2026)** identified location routine index as a significant predictor of depression severity:
- Location routine index correlated with depression severity (r = 0.23, 95% CI 0.02 to 0.42)
- In regression models, location routine index explained 4.39% of the variance in depression severity
- Regularity indices for app usage, screen unlock timing, and location patterns all showed associations
- Screen regularity index and app regularity index capture the similarity of behaviour between the same hours across different days

**Cho et al. (2020)** demonstrated that continuous monitoring of circadian and activity rhythms could predict mood changes. Their CRM (circadian rhythm monitoring) system enabled prediction of mood over 3-day windows, with routine disruption being a central feature.

**Tseng et al.** combined active and passive data to demonstrate that daily routine features were predictive of symptom changes in bipolar disorder, with routine disruption preceding mood episode transitions.

**Henson et al. (2020)** found that daily routines influence symptoms in schizophrenia, with passive data features related to routine regularity showing significant associations with symptom severity (Spearman rho ranging from -0.23 to -0.30, p < .001).

**The "Patterns to Deviations" study (Electronics, 2026)** proposed a personalised behavioural drift detection approach using rolling statistical windows. Their methodology found that:
- Temporal context modelled through user-specific rolling baselines was essential for capturing gradual decay of behavioural routines
- Sequence-based models (1D-CNN and LSTM) were significantly more capable of modelling the cumulative nature of behavioural change than static approaches
- The late-fusion LSTM model achieved recall of 0.871 for detecting behavioural drift
- Behavioural disengagement was found to be a "sparse, cross-domain phenomenon" requiring multimodal integration

### 8.3 Evidence Strength: MODERATE

Routine disruption is supported by multiple studies but often as a secondary finding within broader mobility or circadian analyses. The "drift-streak" methodology represents a promising advancement. The conceptual link between routine disruption and psychiatric symptoms is strong, particularly for bipolar disorder where social rhythm disruption is a well-established theoretical construct.

### 8.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research has found that reduced regularity in daily location patterns has been associated with higher depression severity scores."
- "Disruption in daily behavioural routines has been explored as a potential marker for mood changes, particularly in bipolar disorder."
- "Longitudinal methods that detect gradual decay of behavioural routines have shown promise in identifying behavioural drift, though clinical validation is ongoing."

**Uncertainty level: MEDIUM.** Routine metrics are sensitive to lifestyle changes unrelated to mental health (holidays, job changes, seasonal variation). The measurement of "routine" is itself complex -- what constitutes a meaningful routine disruption versus normal variation? Personalised baselines are essential but require sufficient longitudinal data to establish.

### 8.5 Measurement Considerations

- Regularity indices compare behaviour at the same hours across different days
- Location routine index appears most strongly associated with depression among routine metrics
- App regularity index captures digital routine disruption
- Screen regularity index captures timing disruption of phone engagement
- Establishing stable baselines requires at least 2-4 weeks of data
- Gradual vs. abrupt routine disruption may have different clinical significance

---

## 9. Activity Transition Reduction

### 9.1 Definition and Operationalisation

Activity transition reduction refers to decreases in the number and variety of transitions between different activities, locations, and behavioural states throughout the day. This includes: reduced transitions between locations (GPS-derived), decreased transitions between phone states (screen on/off transitions), fewer transitions between different app categories, and reduced transitions between home and non-home locations.

### 9.2 Evidence Summary

**Meyerhoff et al. (2021)** found that changes in depression were predicted by changes in GPS transition features:
- GPS transitions correlated with depression changes (r = -0.21, p = .03)
- This was part of a broader pattern where changes in GPS features (Time, locations, exercise duration, transitions, active app use) predicted subsequent changes in depression
- The direction indicates that reduced transitions were associated with increased depression
- Changes in sensor-derived behavioural characteristics were associated with subsequent changes in depression, but not vice versa, suggesting that behavioural transition changes may precede symptom changes

**Zhan et al. (2025)** measured transition time (time spent moving between locations) from GPS data as part of their mobility features, finding that mobility features overall were significantly associated with depression severity. Location entropy (diversity of visited locations) was also included, which captures the variety of activity contexts.

**Chikersal et al. (2021)** included location-related features in their predictive model, with campus map analysis (location patterns in relation to key locations) being one of the seven core features predicting depressive symptoms with >80% accuracy.

**The "Patterns to Deviations" study (Electronics, 2026)** highlighted that behavioural disengagement is a "sparse, cross-domain phenomenon" -- meaning that reduced transitions across different behavioural domains (activity, sleep, communication) together create a stronger signal than changes in any single domain. Their multimodal approach integrating activity, sleep, and communication transitions achieved high sensitivity for detecting behavioural drift.

**Henson et al. (2020-2021)** found that mobility and social anomalies (which include transition disruptions) were elevated around relapse events in schizophrenia. The combined mobility and social anomaly pattern showed particular elevation within 2 weeks of relapse.

### 9.3 Evidence Strength: MODERATE

Activity transition reduction is a relatively specific marker with support from several studies. The Meyerhoff et al. finding that GPS transitions predict subsequent depression changes (but not vice versa) is particularly notable. However, the evidence base is narrower than for general mobility or social withdrawal markers.

### 9.4 Safe Wording and Uncertainty

**Recommended phrasing:**
- "Research suggests that reduced transitions between locations and activities have been associated with subsequent changes in depression scores in some longitudinal studies."
- "The number of behavioural transitions throughout the day has been explored as a marker of engagement levels, with lower transitions correlating with higher symptom severity."
- "Multimodal approaches that examine transitions across activity, sleep, and communication domains together have shown higher sensitivity for detecting behavioural changes than single-domain analysis."

**Uncertainty level: MEDIUM-HIGH.** Activity transitions are analytically complex to define and measure. The distinction between "activity transition reduction" and general "mobility reduction" is somewhat blurry. Different operationalisations (location transitions, app category transitions, state transitions) may capture different constructs. More standardised measurement approaches are needed.

### 9.5 Measurement Considerations

- GPS-based location transitions require accurate location clustering algorithms
- Screen state transitions (lock/unlock frequency) provide a simpler proxy
- App category transitions may reflect cognitive engagement variety
- Transition metrics are most informative when combined with overall activity levels
- Within-day transition patterns (morning vs. evening) may carry additional signal
- The optimal time window for transition calculation (daily, weekly) requires further investigation

---

## 10. Cross-Cutting Considerations

### 10.1 Multimodal Integration

The most consistent finding across the literature is that **multimodal integration substantially improves marker sensitivity and specificity**. No single behavioural marker provides adequate signal for reliable detection.

Key evidence:
- Chikersal et al.: 7-feature multimodal model achieved >80% accuracy for depression prediction
- The "Patterns to Deviations" study: late-fusion LSTM integrating activity, sleep, and communication achieved recall of 0.871
- SHARP study: combining passive with active data improved predictive power 1.41x
- Combined EMA and sensing model explained 45.15% of variance in depression (vs. 35.28% for EMA alone and 20.45% for sensing alone)

### 10.2 Temporal Considerations

- **Look-back windows**: Most studies use 7-30 day look-back windows for feature aggregation
- **Prediction horizons**: 30-day relapse prediction horizons are commonly used
- **Anomaly timing**: Behavioural anomalies appear to cluster 1-2 weeks before relapse events
- **Drift detection**: Gradual behavioural drift may be more clinically meaningful than sudden changes
- **Circadian cycles**: 24-hour rhythmicity is fundamental; markers should be assessed within circadian context

### 10.3 Cultural and Contextual Factors

- The SHARP study found anomaly detection was equally effective across US and Indian sites (p = 0.165 for site differences), suggesting some markers may be culturally invariant
- However, baseline communication norms, mobility patterns, and sleep timing vary substantially across cultures
- COVID-19 affected digital phenotyping patterns differently across sites due to varying lockdown restrictions
- Urban vs. rural settings dramatically affect GPS mobility baselines

### 10.4 Privacy and Ethics

- All digital phenotyping research must address informed consent, data minimisation, and transparency
- Passive sensing raises significant privacy concerns that can affect participant trust and adherence
- The Beiwe platform (used in multiple studies) is available open-source, enabling standardised, secure data collection
- LAMP (Learning, Assessment, and Management Platform) provides open-source tools for both active and passive data collection

---

## 11. Evidence Summary Matrix

| Marker | Evidence Strength | Key Effect Sizes | Uncertainty Level | Primary Data Streams |
|--------|-------------------|-------------------|-------------------|---------------------|
| Social withdrawal | Moderate-Strong | r = -0.31 to -0.43 | Medium | Call/SMS logs, app usage |
| Circadian disruption | Moderate-Strong | r = 0.37-0.40 for sleep irregularity | Medium-Low | Wearables, GPS, screen state |
| Mobility reduction | Strong | Systematic review confirmed | Low-Medium | GPS, accelerometer |
| Behavioural activation decline | Moderate | 85.7% accuracy in multimodal models | Medium | Steps, activity, app usage |
| Adherence drop-off | Moderate | 63.8% active adherence in SZ vs. 75.3% in controls | Medium-High | Survey completion, data quality |
| Communication entropy | Moderate | r = -0.19 to -0.32 | Medium | Call/text entropy, app usage entropy |
| Routine disruption | Moderate | r = 0.23 for location routine | Medium | Regularity indices, GPS patterns |
| Activity transition reduction | Moderate | r = -0.21 for GPS transitions | Medium-High | GPS transitions, screen state changes |

### Direction of Association Summary

| Marker | Worsening Mental Health Direction |
|--------|-----------------------------------|
| Social withdrawal | Decreased calls, texts, social contacts |
| Circadian disruption | Increased sleep timing variability |
| Mobility reduction | More time at home, less distance traveled |
| Behavioural activation decline | Fewer steps, less activity variety |
| Adherence drop-off | Reduced survey completion, data quality decline |
| Communication entropy | More irregular communication patterns |
| Routine disruption | Less predictable daily location patterns |
| Activity transition reduction | Fewer transitions between locations/states |

---

## 12. Limitations and Research Gaps

### 12.1 Current Limitations

1. **Sample size**: Many studies are small (n < 50), limiting generalisability
2. **Study duration**: Most studies span weeks to months; long-term (multi-year) evidence is scarce
3. **Publication bias**: Positive findings may be overrepresented
4. **Measurement heterogeneity**: Different studies operationalise the same constructs differently
5. **Causality**: Nearly all evidence is correlational; causal inference is not established
6. **Confounding**: Physical health, medication, lifestyle changes, and environmental factors all confound digital phenotype-symptom associations
7. **Baseline variation**: Individual differences in baseline behaviour make population-level thresholds problematic

### 12.2 Research Gaps

1. **Standardised metrics**: Consensus definitions for each marker are lacking
2. **Personalised baselines**: More research on establishing individual behavioural baselines is needed
3. **Real-world deployment**: Most evidence comes from research studies, not clinical implementations
4. **Cross-diagnostic validity**: Markers validated primarily in depression need validation in other conditions
5. **Ethnic and cultural diversity**: Most studies have been conducted in high-income, predominantly white populations
6. **Age range**: Adolescent and elderly populations are underrepresented
7. **Mechanistic understanding**: The pathways linking digital behaviour changes to clinical outcomes remain unclear
8. **Alert fatigue**: The clinical utility of continuous monitoring depends on managing false positive rates

### 12.3 Emerging Directions

1. **Drift-streak methodology**: Personalised, longitudinal drift detection shows promise
2. **Audio-based features**: Free-living audio sociability features complement communication logs
3. **Keyboard dynamics**: Typing speed, pauses, and patterns may add signal
4. **Cross-modal fusion**: Combining wearables, smartphones, and ecological momentary assessment
5. **Open-source platforms**: Beiwe, LAMP, AWARE, and RAPIDS are enabling standardised research

---

## 13. References

### Primary Sources

1. Zhan et al. (2025). "Digital phenotyping of depression." University of Wisconsin-Madison.
2. Henson et al. (2020). Digital phenotyping in schizophrenia -- 3-month study with 92 participants. GPS, accelerometer, screen, call/SMS logs.
3. Henson et al. (2021). Digital phenotyping in schizophrenia -- 2-year longitudinal study. 83 schizophrenia, 43 controls. Sensitivity 89%, specificity 75%.
4. JMIR (2026). "The Relation Between Passively Collected GPS Mobility Metrics and Depressive Symptoms: Systematic Review and Meta-Analysis."
5. Meyerhoff et al. (2021). Longitudinal study of 282 participants with mood and anxiety disorders using GPS, app use, calls, messages.
6. Chikersal et al. (2021). 138 college students, 16-week study. Multimodal depression prediction with 85.7% accuracy.
7. Beiwinkel et al. SIMBA study -- bipolar disorder digital phenotyping with GPS, accelerometer, calls, SMS over 12 months.
8. Cho et al. (2020). Circadian rhythm monitoring in mood disorders -- 12-month study showing 96.7% fewer mood episodes.
9. PMC8192468 (2021). "Digital phenotyping adherence, feasibility, and tolerability in outpatients with schizophrenia."
10. Nature (2023). "Relapse prediction in schizophrenia with smartphone digital phenotyping during COVID-19." SHARP study, 3-site, 2-country.
11. PMC12872212. "Using Smartphone-Based Digital Phenotyping to Predict Relapse in Serious Mental Disorders." Bangladesh TRANSFORM study.
12. JMIR (2026). "Investigating Smartphone-Based Sensing Features for Depression Severity Prediction." Location routine index, app entropy, call features.
13. Nature (2024). "Mobile sensing-based depression severity assessment." Communication asymmetry and skewness coefficients.
14. Electronics (2026). "From Patterns to Deviations: Detecting Behavioural Drift for Mental Health Monitoring." Late-fusion LSTM, drift-streak methodology.
15. PMC6006347. "Relapse prediction in schizophrenia through digital phenotyping." Beiwe platform study with anomaly detection.
16. Laiou et al. (2022). GPS and depression severity -- 2-year study with 164 participants in London.
17. PMC9118091 (2022). "Smartphone sensor data for identifying and monitoring mood disorders." Circadian rhythm from GPS.
18. PMC12954677 (2025). "Distinguishing Common Digital Phenotyping and Self-Report Parameters for Monitoring and Predicting Depression: Scoping Review."
19. PMC9082162. "A Narrative Review of Empirical Literature of Behavioral Activation Treatment for Depression."
20. PMC4000560. "Circadian Rhythms and Psychiatric Illness." Wulff et al. melatonin cycle disruptions in schizophrenia.

### Supporting Sources

21. Canzian & Musolesi. MoodTraces study -- mobility behaviour prediction of depressive states.
22. Faurholt-Jepsen et al. Bipolar disorder mobility patterns -- reduced during depression, increased during mania.
23. Tseng et al. Real-time monitoring and prediction of bipolar symptom changes using smartphone apps.
24. Zhang et al. (2024). Wearable-derived physical activity, heart rate, and sleep pattern depression markers.
25. Song et al. Pilot study -- older adults, daily depressive symptom prediction via wearables.
26. Jacobson et al. Smartphone sensor data predicting social anxiety severity via machine learning.
27. PMC10753422 (2023). "Digital Phenotyping for Monitoring Mental Disorders." Systematic review.
28. MDPI Healthcare (2025). "Harnessing Digital Phenotyping for Early Self-Detection of Psychological Distress." ESFY prototype.
29. PMC12871944. "Digital Phenotyping for Adolescent Mental Health." Regularity indices, entropy features.
30. Medrxiv (2025). "Unobtrusive inference of circadian rhythms from smartphone data."
31. PMC11794190. "Impact of Smartphone Usage on Sleep in Adolescents." Circadian rhythm disruption.
32. PMC11662189 (2024). "Dynamic Bidirectional Associations Between GPS Features and Mood."
33. Bai et al. (2021). 334 participants, 12-week MDD study with heart rate, sleep, steps, calls, GPS.
34. Pedrelli et al. (2020). 31 MDD participants, 8-week passive monitoring with smartphone and wristbands.
35. PMC11826944 (2024). "Investigating Smartphone-Based Sensing Features for Depression."

---

## Document Notes

- This document is intended for research context only and does not constitute clinical guidance
- All risk markers are presented with their associated evidence strengths and uncertainty levels
- The framing throughout uses cautious language appropriate for correlational research evidence
- No claims of autonomous prediction, diagnosis, or crisis detection are made
- Clinical implementation would require regulatory approval, validation studies, and integration with existing care pathways
- The document may be updated as new evidence emerges in the rapidly evolving field of digital phenotyping

---

*Generated for research synthesis purposes. Not for clinical use without appropriate validation and oversight.*
