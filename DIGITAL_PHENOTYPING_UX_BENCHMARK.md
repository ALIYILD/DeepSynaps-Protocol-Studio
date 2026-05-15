# Digital Phenotyping UX Benchmark: Clinical Dashboard Design Patterns

## Executive Summary

This benchmark synthesizes UX patterns across eight leading digital phenotyping platforms and the broader clinical dashboard ecosystem. The analysis focuses on six critical dimensions: clinician cognitive load, uncertainty visibility, longitudinal trend display, signal provenance, behavioural event annotation, and degraded state handling. Key findings reveal that while most platforms excel at data collection, few provide adequate uncertainty visualization or signal provenance transparency -- creating trust barriers for clinical adoption. The most mature UX patterns are found in co-designed platforms (mindLAMPVis) and those built with explicit clinical workflow integration (HOPES, DPdash), while research-focused tools (Beiwe/Forest, AWARE) prioritize data throughput over clinical interpretability.

---

## 1. Benchmark Systems Overview

### 1.1 MindStrong Health

MindStrong Health operates as an AI-enabled digital phenotyping and telemedicine network for outpatient behavioral health management. The platform tracks user interactions on smartphones -- types, taps, swipes, scrolls -- analyzing these through machine learning to detect depression and mental health conditions. The system correlates typing speed, error rates, punctuation usage, and app-switching velocity with cognitive markers of mental state. Results are shared with patients and medical providers through a dashboard interface.

**Key UX Characteristics:**
- Passive data collection from keyboard interaction patterns
- ML-based correlation engine mapping interaction metrics to mental health indicators
- Provider-facing results portal with patient-level trend summaries
- Early detection focus: claims ability to predict mood states ~1 week ahead
- Accessible via healthcare provider referral only, ensuring clinical oversight

**Strengths:** Novel interaction-pattern signals provide cognitive markers not captured by traditional sensors. The keyboard-centric approach minimizes battery impact.

**Gaps:** Limited public documentation of dashboard UX patterns. Uncertainty visualization for ML predictions appears minimal. Signal provenance (which specific keystrokes contribute to scores) is opaque.

### 1.2 Ksana Health (EARS 2.0)

The Effortless Assessment Research System (EARS) 2.0 by Ksana Health is a mobile sensing and passive remote assessment platform designed for behavioral research. The system collects accelerometer data, GPS location, keyboard usage patterns, music/media listening, screen-time/app usage, light sensor readings, battery state, and call status through smartphone sensors.

**Key UX Characteristics:**
- Intuitive web-accessible Research Dashboard for monitoring data uploads and quality
- No-code study configuration interface for non-technical researchers
- Real-time data upload monitoring with quality indicators
- Color-coded data collection status (red = action needed, orange = monitor, green = normal)
- EMA survey administration and scheduling built-in

**Strengths:** The dashboard explicitly prioritizes data quality visibility, making upload status and compliance immediately apparent. The no-code configuration reduces researcher burden.

**Gaps:** Limited longitudinal visualization tools in the default dashboard. Uncertainty visualization for missing or noisy sensor data is minimal. The dashboard appears optimized for research administration rather than clinical interpretation.

### 1.3 Beiwe Research Platform & Forest Analytics

Beiwe, developed at the Harvard T.H. Chan School of Public Health, is an open-source digital phenotyping platform consisting of Android/iOS apps and an AWS-based back-end. The Forest library provides Python-based analytics for GPS mobility metrics, call/text log summaries, survey completion tracking, accelerometer gait analysis, and synthetic data generation.

**Key UX Characteristics:**
- Tableau API integration for customizable dashboards and data summaries
- On-demand analytics generating daily/hourly summary statistics
- Data collection troubleshooting interface via Tableau workbooks
- Modular subpackage architecture: Bonsai (simulation), Jasmine (GPS/mobility), Willow (logs), Sycamore (surveys), Oak (accelerometer)
- Color-coded data completion heatmaps (phone vs. wearable device rows)

**Strengths:** Deep analytical integration through Forest. Tableau provides flexible, customizable visualization. The modular architecture enables targeted analysis for specific research questions.

**Gaps:** The Tableau-based approach requires significant analyst expertise. No built-in uncertainty visualization for imputed GPS trajectories. Clinician-facing views are not a primary design focus -- the platform is optimized for researchers. The dependency on commercial software (Tableau) creates cost/access barriers.

### 1.4 AWARE Framework

AWARE is a mobile context instrumentation framework for Android (with iOS ports) that captures hardware, software, and human-based sensor data. The framework supports study deployment through a web-based dashboard at api.awareframework.com, enabling remote sensor management, ESM/EMA questionnaire triggering, and data visualization.

**Key UX Characteristics:**
- Sensor Manager UI showing active sensors with power-consumption estimation
- Stream interface presenting contextualized, real-time data visualizations
- Plugin Manager for extensible sensor capabilities
- Web dashboard for study orchestration with QR-code participant enrollment
- MQTT-based real-time context messaging between devices
- Scalability tested to 1M+ participants (dashboard loads in ~0.85s up to 1M devices)

**Strengths:** Highly extensible plugin architecture. Real-time context exchange via MQTT. Strong privacy controls with one-way hashing of personal identifiers. Performance at scale is well-documented.

**Gaps:** Visualization capabilities are basic and researcher-oriented rather than clinician-facing. Uncertainty visualization for context inference is not addressed. The Stream interface focuses on real-time data presentation rather than longitudinal trend analysis. Degraded state handling for missing sensors relies on exception fallbacks with limited visual feedback.

### 1.5 Purple Robot

Purple Robot is a modular behavioral intervention technology system developed at Northwestern University's Center for Behavioral Intervention Technologies. The system includes Purple Robot (sensing), Purple (content management), and intervention delivery components. It was notably used in the Mobilyze depression intervention study.

**Key UX Characteristics:**
- Event-triggered momentary intervention delivery based on sensed context
- Mood and activity tracking with longitudinal graph feedback to users
- Coach interface providing use and clinical data for motivational calls
- Content management system for non-programmers to author interventions
- Separate databases for sensor/acquisition data vs. use/interaction data (security precaution)

**Strengths:** The coach/clinician interface integrates usage data with clinical context for personalized outreach. The separation of sensor and use databases demonstrates thoughtful data architecture for clinical settings.

**Gaps:** Limited public documentation of the clinician dashboard UX. Visualization of sensor data quality or uncertainty is not prominent. The system is optimized for intervention delivery rather than longitudinal monitoring display.

### 1.6 Mobilyze

Mobilyze is a smartphone-based intervention for depression built on the Purple platform. It collects positioning, inertial, virtual, and ambient sensor data to infer mood, emotions, cognitive/motivational states, physical activity, and social context. The system uses ambient light sensors to approximate environmental context (though technical problems were reported with implausible readings above maximum meaningful values).

**Key UX Characteristics:**
- User-facing graphs displaying mood over time
- Average pleasure and accomplishment visualizations from activity tracking
- Coach-facing interface with use data and clinical data integration
- Real-time mental state prediction from passive sensing
- Mood check-ins with self-reported scores

**Strengths:** Early demonstration of real-time mental state prediction from passive data. Integration of self-reported and passive data in a unified view.

**Gaps:** Ambient light sensor issues illustrate challenges with signal quality transparency. No visible uncertainty indicators for predicted mental states. The dashboard does not prominently display data provenance or collection quality metrics.

### 1.7 HOPES (Harvard/HOPES Platform)

HOPES extends the Beiwe platform with wearable integration (Fitbit), clinical summarization dashboards, anomaly detection systems, and data quality monitoring tools. Developed for schizophrenia research (HOPE-S study), the platform provides comprehensive data collection monitoring with color-coded status indicators.

**Key UX Characteristics:**
- Data Collection Dashboard with color-coded status: RED (action needed), ORANGE (monitor), GREEN (normal)
- Monitored data types: location, sociability, app taps, last upload timestamps, sleep
- Anomaly Detection Dashboard with daily probability scores per participant per feature
- Multivariate anomaly scores capturing interdependencies between features
- Data Completion Dashboard with day-by-day heatmap visualization
- Completion rate analysis showing 92.2% overall data completion across 22 participants

**Strengths:** Explicit multi-level data quality visualization (collection, completion, anomaly). The anomaly dashboard is modular, allowing algorithm replacement without UX changes. Color coding is systematic and action-oriented. The distinction between research and clinician dashboards enables role-appropriate views.

**Gaps:** Anomaly detection scores require significant statistical literacy to interpret. The heatmap format, while efficient, can obscure temporal patterns. The system does not visualize uncertainty in individual sensor measurements.

### 1.8 mindLAMP & mindLAMPVis

The LAMP (Learn, Assess, Manage, Prevent) platform, developed by the Division of Digital Psychiatry at BIDMC, is a comprehensive digital phenotyping system with four components: App, Dashboard, Database, and Cortex analytics pipeline. mindLAMPVis is a co-designed clinician-facing visualization portal specifically created for schizophrenia relapse prediction in Indian clinical settings.

**Key UX Characteristics:**
- Web-based coordinator dashboard for study configuration and real-time monitoring
- Data Portal for comprehensive patient data querying and review
- mindLAMPVis: dual-panel comparative visualization system
- Multiple imputation methods visible to clinicians (MICE, LOCF) -- users explicitly select the method
- Comparative visualization enabling cross-time and cross-patient pattern exploration
- 10-language internationalization support

**Strengths:** The co-design process involved clinicians in Boston and Bangalore, software developers, and visualization experts. The dual-panel comparative approach is the most sophisticated visualization pattern identified. Explicit imputation method selection provides transparency in data preprocessing. Designed for high-volume clinic settings with quick-access requirements.

**Gaps:** The platform requires significant setup and customization effort. The distinction between active and passive data creates potential interpretation challenges. Anomaly detection integration is less mature than HOPES.

---

## 2. Cross-Cutting UX Pattern Analysis

### 2.1 Clinician Cognitive Load

The "Three-Second Rule" articulated by Fuselab Creative provides a foundational benchmark: can a clinician glance at the screen and identify which patients are in danger within three seconds? Across the benchmarked systems, cognitive load management varies significantly.

**Progressive Disclosure Patterns:**
- **HOPES** implements the strongest progressive disclosure hierarchy: data collection status (traffic-light colors) at the top level, anomaly scores at the intermediate level, and raw feature data at the detail level. This three-tier structure aligns with clinical triage workflows.
- **mindLAMPVis** uses a dual-panel comparative approach that reduces cognitive load by enabling side-by-side rather than sequential comparison. However, the choice of imputation method adds a decision point that may increase load for some users.
- **Beiwe/Forest** places the cognitive burden on the analyst to configure Tableau visualizations. This requires significant technical expertise and creates high cognitive load for non-technical clinicians.
- **Ksana Health/EARS** prioritizes data quality monitoring over clinical interpretation, resulting in a research-administrator-oriented cognitive model rather than a clinical decision-support model.

**Key Insight:** The most effective cognitive load reduction occurs when dashboards are designed for specific clinical roles (triage nurse vs. treating psychiatrist vs. researcher) rather than attempting to serve all roles simultaneously. The HOPES approach of role-specific dashboards (research vs. clinical) is the most mature pattern.

### 2.2 Uncertainty Visualization

Uncertainty visualization emerged as the most significant gap across all benchmarked systems. The clinical visualization literature (Harrigan et al., 2021; Heltne et al., 2023) strongly emphasizes that clinician trust is more impacted by transparency about uncertainty sources than by the degree of uncertainty itself.

**Uncertainty Patterns Identified:**
- **mindLAMPVis** leads in uncertainty transparency by making imputation method selection explicit (MICE vs. LOCF). This enables clinicians to understand how missing data is handled. However, it does not visualize uncertainty in individual data points.
- **HOPES** quantifies anomaly detection uncertainty as probability scores (0-1 scale), but these require statistical literacy to interpret. No visualization of sensor-level measurement uncertainty.
- **Harrigan et al.'s errorBlob/errorFade techniques** (from the ACM CHI workshop) highlight areas of low/high uncertainty through spatial and color variation -- but these are not implemented in any of the benchmarked production systems.
- **Quantile dot plots** (identified in clinical uncertainty research) successfully reduce interpretation errors compared to traditional error bars, but are not used in any benchmarked platform.

**Clinical Uncertainty Taxonomy for Digital Phenotyping:**
| Uncertainty Type | Description | Current Visualization |
|-----------------|-------------|----------------------|
| Sensor dropout | Missing sensor readings due to device/usage issues | Traffic-light status (HOPES) |
| Measurement noise | Inherent variability in sensor readings | Not visualized |
| Feature uncertainty | Uncertainty in derived features (e.g., sleep estimates) | Not visualized |
| Imputation uncertainty | Uncertainty introduced by filling missing data | Method selection (mindLAMPVis) |
| Model prediction uncertainty | Confidence in ML predictions | Probability scores (HOPES anomaly) |
| Concept drift | Changes in patient baseline over time | Not addressed |

**Key Insight:** No benchmarked system provides comprehensive uncertainty visualization. The gap between research recommendations (quantile dot plots, feature-level uncertainty transparency) and production implementations is substantial. This represents the highest-priority UX improvement opportunity.

### 2.3 Longitudinal Trend Display

Longitudinal data visualization is central to digital phenotyping's clinical value proposition. Multiple patterns were identified across the benchmarked systems and related literature.

**Longitudinal Visualization Patterns:**
- **HOPES Data Completion Dashboard** uses a day-by-day heatmap grid where each participant has two rows (phone/wearable) and each cell represents one day. This format efficiently shows compliance patterns across time and participants but can obscure intra-day patterns.
- **mindLAMPVis Comparative Panels** enable viewing the same patient across different time windows or different patients at the same time. This dual-panel approach supports both within-patient and between-patient longitudinal comparison.
- **Clinical Timelines (Rho Inc.)** provide faceted timeline views by event type, supporting population-level and individual-level views. The population view enables pattern detection across cohorts; the individual view combines characteristics, faceted timelines, and event listings.
- **ATD Dashboard** (for longitudinal surveys) overlays projections, displays prior-wave data, and incorporates both survey data and paradata. Confidence intervals (90%) are displayed alongside trend lines.
- **Forest/Tableau** supports customizable longitudinal views but requires analyst configuration. Standard outputs include LOESS-smoothed trend lines and individual trajectory overlays.

**Best Practices for Longitudinal Digital Phenotyping Displays:**
1. **Trend + raw overlay:** Show smoothed trends (e.g., LOESS) alongside individual data points to preserve both signal and variability visibility
2. **Baseline reference:** Include a patient-specific baseline or control-period reference for deviation assessment
3. **Periodicity indicators:** Mark weekend/weekday patterns (HOPES found this critical for schizophrenia behavioral patterns)
4. **Intervention markers:** Annotate treatment changes, medication adjustments, or clinical interventions on the timeline
5. **Confidence envelopes:** Display prediction intervals or confidence bands around trend lines

### 2.4 Signal Provenance

Signal provenance -- understanding where data comes from, how it was processed, and what transformations it underwent -- is critical for clinical trust and reproducibility. The mProv initiative (NSF-funded) explicitly addresses this gap for high-frequency mobile sensor data.

**Provenance Patterns:**
- **Beiwe/Forest** provides a structured data pipeline with clear subpackage responsibilities (Jasmine for GPS, Willow for logs, Oak for accelerometer). However, provenance visualization is not part of the dashboard UX.
- **AWARE Framework** uses ContentProviders with consistent schema (timestamp, device_id) enabling data lineage tracking. The MQTT-based messaging creates an audit trail of context exchanges.
- **Purple Robot** separates sensor/acquisition and use/interaction databases as a security measure, which incidentally supports provenance tracking.
- **Open mHealth's mProv** initiative (complementing MD2K) aims to develop provenance cyberinfrastructure for mobile sensor data, enabling "snapshot and replay" of data and algorithm outputs.
- **PROV-based comic visualization** research demonstrates promising approaches for making provenance accessible to non-technical users, though not implemented in production systems.

**Key Insight:** Signal provenance is largely invisible in current clinical dashboards. Clinicians cannot easily determine whether a given data point was directly sensed, imputed, derived, or inferred. This opacity undermines trust and limits clinical actionability.

### 2.5 Behavioural Event Annotation

Behavioural event annotation enables clinicians to mark, categorize, and interpret significant events within longitudinal data streams.

**Annotation Patterns:**
- **Plexlines** (timeline visualization for socio-communicative behaviors) provides a sophisticated model: colored circles represent behaviour types (gaze=blue, gesture=green, speech=red), with circle diameter proportional to duration. Overlapping circles indicate co-occurring behaviours. This approach could be adapted for digital phenotyping event annotation.
- **Clinical Timelines** (Rho Inc.) support event highlighting by type, with an event highlighting dropdown that gives selected event types greater visual prominence.
- **HOPES** enables anomaly scoring but does not support clinician-driven event annotation on the timeline.
- **mindLAMP** allows activity scheduling and messaging but clinician annotation of observed events appears limited.
- **EMA dashboards** (e.g., Project ENGAGE) use concentric ring visualizations to show compliance progress, but this is participant-facing rather than clinician-facing.

**Recommended Event Annotation Hierarchy:**
1. **Automated events:** Algorithm-detected anomalies, pattern changes, prediction alerts
2. **Clinical events:** Relapse episodes, medication changes, hospitalizations, appointment notes
3. **Self-reported events:** Patient mood ratings, symptom reports, EMA responses
4. **System events:** Data collection gaps, sensor changes, app updates

### 2.6 Degraded State Handling

Degraded state handling refers to how dashboards respond when data quality declines -- sensors fail, participants stop engaging, or network connectivity is interrupted.

**Degraded State Patterns:**
- **HOPES** implements the most systematic degraded-state handling: RED status triggers action (contact participant), ORANGE triggers monitoring, GREEN indicates normal collection. The Data Completion Dashboard explicitly visualizes missing-data patterns.
- **AWARE Framework** uses exception fallbacks for faulty sensors, wake-locks to prevent sensor death during idle, and multi-threading to reduce storage delays. Data is queued locally when the server is unreachable.
- **Forest/Jasmine** implements state-of-the-art GPS imputation for missing location data, with trajectory reconstruction capabilities.
- **mindLAMPVis** handles sparse active data (relatively few engaged users providing survey responses) through explicit imputation method selection.
- **EHR Missing Data Strategies** (applicable by analogy): Multiple imputation using health status and healthcare utilization predictors. Multi-level multiple imputation achieves 84.6% success for longitudinal clinical variables.

**Degraded State UX Principles:**
1. **Graceful degradation:** Never crash or show empty screens -- always show what data exists with clear indicators of what's missing
2. **Temporal context:** Show how long data has been degraded to distinguish brief gaps from sustained issues
3. **Actionable guidance:** Provide specific next steps (e.g., "Contact participant - GPS data missing 3 days")
4. **Imputation transparency:** When data is filled in, explicitly indicate the method used
5. **Confidence adjustment:** Reduce certainty indicators proportionally to data degradation

---

## 3. Comparative UX Assessment Matrix

| Dimension | MindStrong | Ksana/EARS | Beiwe/Forest | AWARE | Purple/Mobilyze | HOPES | mindLAMP |
|-----------|------------|------------|--------------|-------|----------------|-------|----------|
| **Cognitive Load** | Medium | Low (admin) | High (analyst) | Medium | Medium | Low-Medium | Medium |
| **Uncertainty Vis** | Minimal | Minimal | Minimal | None | Minimal | Scores only | Imputation only |
| **Longitudinal Display** | Basic | Basic | Customizable (Tableau) | Basic | Graph-based | Heatmap+Scores | Comparative panels |
| **Signal Provenance** | Opaque | Basic | Pipeline-defined | Schema-consistent | DB-separated | Score-source | Method-transparent |
| **Event Annotation** | Limited | Limited | Configurable | ESM-based | Coach notes | Anomaly alerts | Limited |
| **Degraded Handling** | Unknown | Upload monitoring | Imputation (Jasmine) | Exception fallbacks | Sensor issues | Traffic-light system | Explicit imputation |

---

## 4. Key UX Gaps and Recommendations

### 4.1 Critical Gap: Uncertainty Visualization

**Problem:** No benchmarked system provides comprehensive, clinically accessible uncertainty visualization. Clinicians cannot distinguish high-confidence from low-confidence data points, undermining trust and decision-making.

**Recommendation:** Implement a multi-layer uncertainty visualization system:
- **Point-level:** Vary opacity or glyph size based on measurement confidence
- **Trend-level:** Display confidence bands around smoothed trends
- **Prediction-level:** Use quantile dot plots or gradient opacity to show prediction distributions
- **Imputation-level:** Explicitly mark imputed vs. observed data with distinct visual treatment
- **Dashboard-level:** Summary uncertainty indicators (e.g., "Data Quality Score: 87%") visible at all times

### 4.2 Critical Gap: Signal Provenance Transparency

**Problem:** Clinicians cannot trace how a displayed data point was derived from raw sensor readings through processing pipelines.

**Recommendation:** Implement provenance breadcrumbs showing:
- Raw sensor source (e.g., "GPS (phone)")
- Processing steps applied (e.g., "Imputed using Jasmine")
- Feature derivation method (e.g., "Radius of gyration, daily mean")
- Model used for predictions (e.g., "ARMA(2,1) anomaly score")
- Timestamp of last update

### 4.3 Important Gap: Role-Specific Dashboard Views

**Problem:** Most systems use a single dashboard design for all users, creating either excessive complexity for frontline clinicians or insufficient depth for researchers.

**Recommendation:** Implement progressive disclosure by role:
- **Triage view:** Traffic-light patient list with 3-second scanability
- **Clinical view:** Individual patient timeline with trends and alerts
- **Research view:** Exploratory analytics with customizable parameters
- **Administrative view:** Population-level summaries and compliance metrics

### 4.4 Important Gap: Cross-Modal Integration

**Problem:** Passive sensor data, active survey responses, clinical notes, and intervention delivery are typically displayed in separate silos.

**Recommendation:** Implement unified timeline views that overlay:
- Passive sensor trends (mobility, sleep, sociability)
- Active survey responses (mood, symptoms)
- Clinical annotations (medication changes, appointments)
- Intervention events (prompts delivered, lessons completed)
- System events (data gaps, sensor changes)

### 4.5 Emerging Pattern: Co-Designed Visualization

**mindLAMPVis** represents the most promising emerging pattern: a visualization system co-designed by clinicians, software developers, and visualization experts across multiple continents. Key success factors:
- Multidisciplinary design team with equal voice
- Iterative prototyping with real-world data
- Explicit handling of sparse/unpredictable clinical events
- Comparative (rather than confirmatory) visualization philosophy
- Adaptation to local clinical context and workflow

---

## 5. Synthesis: Design Principles for Digital Phenotyping Clinical Dashboards

Based on this benchmark analysis, the following design principles are proposed for next-generation digital phenotyping clinical dashboards:

### 5.1 Trust Through Transparency
- Every data point should be traceable to its source sensor
- Uncertainty should be visible, not hidden
- Imputation and modeling choices should be explicit and user-controllable
- Data quality should be summarized at the dashboard level

### 5.2 Clinical Workflow Integration
- Dashboard views should match clinical roles (triage, treatment, research, administration)
- Information should follow the "Three-Second Rule" for triage decisions
- Alerts should be actionable with clear next steps
- Documentation should support clinical note-taking and team communication

### 5.3 Longitudinal Context
- Patient baselines should be established and displayed as reference
- Trends should be distinguished from single measurements
- Periodicity (weekend/weekday, seasonal) should be visible
- Interventions and clinical events should be annotated on timelines

### 5.4 Degraded State Resilience
- Missing data should never result in empty or crashed displays
- Data gaps should be clearly marked with duration indicators
- Imputed data should be visually distinct from observed data
- Systematic degradation should trigger escalation workflows

### 5.5 Uncertainty as First-Class Information
- Uncertainty should be visualized, not suppressed
- Multiple uncertainty types (sensor, feature, imputation, prediction) should be distinguished
- Clinicians should be able to filter or threshold by confidence level
- Uncertainty visualization formats should be validated with clinical users

---

## 6. References and Sources

1. Harrigan, C.F., Morgenshtern, G., Goldenberg, A., & Chevalier, F. (2021). Considerations for Visualizing Uncertainty in Clinical Machine Learning Models. CHI'21 Workshop.
2. Heltne, U., et al. (2023). Visualizing uncertainty in score reports for mental health care practitioners.
3. Onnela Lab, Harvard T.H. Chan School of Public Health. Beiwe Research Platform Documentation.
4. HOPES Platform (2021). JMIR mHealth and uHealth.
5. mindLAMP Platform Documentation. Division of Digital Psychiatry, BIDMC.
6. mindLAMPVis (2025). JMIR Formative Research.
7. Ferreira, D., et al. (2015). AWARE: Mobile Context Instrumentation Framework. Frontiers in ICT.
8. Gonzalez-Perez, A., et al. (2023). AwarNS Framework. Journal of Biomedical Informatics.
9. Mohr, D.C., et al. (2014). Purple: A Modular System for Behavioral Intervention Technologies. JMRI.
10. Ben-Zeev, D., et al. (CrossCheck Study). Digital phenotyping for schizophrenia relapse prediction.
11. Ksana Health. EARS 2.0 Documentation.
12. MindStrong Health. Platform Overview and Care Demo.
13. Fuselab Creative (2026). Healthcare UX Design Guide: Best Practices for Clinical Products.
14. Aufait UX (2026). Healthcare Dashboard Design: UI UX Best Practices.
15. G�mez Ram�rez, M.J. (2025). Interactive Longitudinal Data Analysis and Visualization. PharmaSUG.
16. Biemer, P., et al. ATD Dashboard for Longitudinal Survey Monitoring.
17. Childress, S. (2018). Clinical Timelines Visualized. PhUSE.
18. Plexlines (2017). Timeline Visualization for Socio-Communicative Behaviors.
19. mProv Initiative. NSF Data Infrastructure Building Blocks Program.
20. Project ENGAGE (2024). Personalized Data Dashboard for EMA Compliance. JMIR.

---

*Report compiled: 2025 | Benchmark scope: 8 platforms across 6 UX dimensions*
