# Patient Home Program Design - Research Report
## UX Patterns for Home Exercise Programs & Patient Task Tracking | 2025-2026

---

## Executive Summary

This report analyzes the UX patterns and design strategies for home exercise programs (HEPs), patient task tracking, and adherence monitoring in patient-facing healthcare applications. Based on research of leading rehabilitation apps, physical therapy portals, and patient engagement platforms, we present **30 actionable UX recommendations** for designing effective home program interfaces.

---

## Top 30 Home Program Design Recommendations

### 1. Exercise Program Dashboard (Patient's Daily View)
**Priority: CRITICAL**

The home program dashboard is the patient's primary interaction surface. It must:
- **Show today's exercises at the top** -- patients should immediately see what they need to do today
- **Use a checklist format** -- each exercise shows a checkbox/completion toggle with visual progress
- **Display exercise cards** -- each card shows: exercise name, thumbnail image/video still, sets x reps x duration, and completion status
- **Progress indicator** -- a visual progress bar showing "3 of 5 exercises completed today"
- **Due time indicators** -- show when exercises should be completed (morning, afternoon, evening)
- **Quick-start button** -- prominent "Start Today's Program" CTA at the top
- **Overdue alerts** -- highlight exercises from previous days that weren't completed

**Design Pattern:** A vertical list of exercise cards with a circular check button on the left. Each card shows a video thumbnail, exercise name, prescribed sets/reps (e.g., "3 sets x 10 reps"), and a progress indicator. Completed cards are visually dimmed with a checkmark overlay. A sticky progress bar at the top shows "60% complete - 3 of 5 done."

---

### 2. Video-First Exercise Instruction
**Priority: CRITICAL**

Exercise videos are the single most important feature for HEP adherence:
- **Auto-play looping video** -- silent, looping video of the exercise on the exercise card
- **Full-screen video player** -- tap to open full-screen with clear audio narration
- **Visual cues overlay** -- arrows indicating movement direction, muscle group highlights
- **Side-by-side comparison** -- show patient performing alongside the reference video (using camera)
- **Written instructions below video** -- step-by-step text instructions as supplement
- **Voice cues** -- audio instructions so patients don't need to look at the screen
- **Variable playback speed** -- allow slow-motion playback for complex movements
- **Download for offline** -- exercises must work without internet connection

**Design Pattern:** Tapping an exercise opens a full-screen view with the video auto-playing at the top (50% screen), step-by-step text instructions scrollable below, a large "Mark Complete" button at the bottom, and a floating timer widget for timed exercises.

---

### 3. Task Completion & Adherence Tracking
**Priority: CRITICAL**

Track every interaction to build adherence data:
- **One-tap completion** -- simplest possible interaction to mark an exercise done
- **Self-reported metrics** -- log actual sets, reps, weight used, and duration
- **Pain/discomfort scale** -- after each exercise, ask "How did that feel?" with a 0-10 pain scale
- **Difficulty rating** -- "Too Easy / Just Right / Too Hard" selection with emoji faces
- **Notes field** -- open text for patients to record observations
- **Completion streaks** -- show consecutive days of program completion
- **Weekly adherence score** -- percentage of prescribed exercises completed
- **Missed exercise tracking** -- log which exercises were skipped and why

**Design Pattern:** After marking an exercise complete, show a bottom sheet asking: "How many sets did you do?" (default to prescribed), "How did it feel?" (emoji faces: 😊 😐 😣), and "Any notes?" (optional text field). The "Next Exercise" button auto-advances to the next item.

---

### 4. Provider Dashboard: Adherence Monitoring
**Priority: HIGH**

Therapists need visibility into patient adherence:
- **Patient adherence overview** -- list of all patients with adherence percentage badges (green >80%, yellow 50-80%, red <50%)
- **Adherence trend graph** -- line chart showing adherence % over time per patient
- **Exercise-level detail** -- which specific exercises are being completed vs. skipped
- **Pain/difficulty tracking** -- aggregated patient-reported outcomes per exercise
- **Alert for non-adherent patients** -- automated flagging of patients below threshold
- **Message patients in context** -- send encouragement directly from adherence view
- **Filter by date range** -- review adherence for specific time periods
- **Export for documentation** -- generate adherence reports for clinical notes

**Design Pattern:** A patient list with sortable columns: Name | Adherence % | Last Active | Pain Trend | Actions. Clicking a patient opens their detailed adherence timeline showing daily completion with color-coded bars (green = completed, red = missed, yellow = partial).

---

### 5. Gamification & Motivation Systems
**Priority: HIGH**

Gamification significantly improves adherence rates:
- **Completion streaks** -- "5-day streak! Keep it going!" with fire icon
- **Achievement badges** -- milestones like "First Week Complete," "30-Day Warrior," "Perfect Week"
- **Progress celebrations** -- confetti animation or success sound on completing all exercises
- **Weekly goals** -- "Complete 4 of 5 days this week" with visual tracker
- **Comparison to previous weeks** -- "You completed 20% more exercises than last week"
- **Recovery milestones** -- celebrate range of motion improvements, pain reduction
- **Points system** -- earn points for completions, redeemable for nothing (intrinsic motivation)
- **Social sharing (optional)** -- share achievements with support network

**Design Pattern:** A "Your Progress" section on the home tab showing: current streak count with fire emoji, 3 unlocked badges displayed as a row, and a circular progress ring for "This Week's Goal: 4/5 days." After completing all exercises, trigger a 3-second confetti celebration with a "Great job!" modal.

---

### 6. Smart Reminders & Push Notifications
**Priority: HIGH**

Reminder timing is critical for adherence:
- **Customizable reminder schedule** -- patient sets preferred times for morning, midday, evening exercises
- **Smart timing** -- send reminders based on patient's completion patterns (e.g., if they usually exercise at 7 AM, remind at 6:45 AM)
- **Graduated reminders** -- gentle nudges escalate if exercises are consistently missed
- **Context-aware messages** -- "Good morning! Your shoulder exercises are ready."
- **Provider-triggered reminders** -- therapists can send personalized encouragement
- **Missed dose alerts** -- if exercises aren't completed by prescribed time, send follow-up
- **Pre-appointment reminders** -- prompt completion before next PT visit
- **Quiet hours respect** -- never send notifications during configured sleep hours

**Design Pattern:** Settings screen with three reminder time pickers: Morning (default 7:00 AM), Afternoon (default 1:00 PM), Evening (default 6:00 PM). Each has a toggle. A "Snooze" option on notifications: "Remind me in 1 hour / 2 hours / Tomorrow."

---

### 7. Phase-Based Program Progression
**Priority: HIGH**

Rehabilitation programs follow phases that should auto-progress:
- **Phase labels** -- clearly show current phase: "Phase 1: Protection & Healing (Weeks 1-2)"
- **Phase roadmap** -- visual timeline showing all phases from start to full recovery
- **Criteria-based advancement** -- "Complete Phase 1 when: Pain <3/10 AND Full ROM achieved"
- **Auto-progression with approval** -- system suggests advancement, therapist approves
- **Phase-specific education** -- content relevant to current recovery stage
- **Exercise intensity indicators** -- show progression from light to moderate to full activity
- **Visual progress bar per phase** -- percentage complete within current phase

**Design Pattern:** A horizontal timeline at the top of the program page showing 4 phases as connected circles. The current phase is filled in color, upcoming phases are gray, completed phases have a checkmark. Below, a card shows: "Phase 2: Strengthening -- Progress: 60% -- Advance when: Pain <2/10 and 90% ROM."

---

### 8. Two-Way Patient-Provider Messaging
**Priority: HIGH**

Communication between patient and therapist improves outcomes:
- **Exercise-specific messaging** -- patients can ask questions about specific exercises
- **Photo/video sharing** -- patients can send videos of their form for feedback
- **Pain reporting** -- structured pain reports with body diagram marking
- **Quick response templates** -- therapists can use saved responses for common questions
- **Read receipts** -- patients know when therapist has seen their message
- **Priority flagging** -- patients can mark messages as urgent
- **Message threading** -- conversations organized by topic
- **Integration with clinical notes** -- messages auto-document in patient chart

**Design Pattern:** A messaging tab with conversation threads. When a patient messages about a specific exercise, the exercise name auto-tags the message. The therapist view shows a message queue with priority indicators and quick-reply buttons ("Looks good!" / "Try bending your knee more" / "Reduce range of motion").

---

### 9. Outcome Measures & Progress Visualization
**Priority: HIGH**

Patients need to see their progress to stay motivated:
- **Pain trend graph** -- line chart of pain scores over time (0-10 scale)
- **Range of motion tracking** -- visual joint angle measurement with comparison to normal
- **Functional outcome scores** -- standardized measures (DASH, ODI, KOOS) with trends
- **Strength testing logs** -- track resistance levels, reps over time
- **Before/after comparison** -- side-by-side progress photos (with proper consent)
- **Goal tracking** -- patient-defined goals with milestone markers
- **Clinical milestone badges** -- "Achieved full knee extension!" milestones
- **Shareable progress report** -- generate a summary for sharing with referring physician

**Design Pattern:** A "My Progress" tab with three sections: (1) Pain trend line graph with 30/60/90-day views, (2) ROM visual showing animated joint movement overlaying target angles, (3) Goal cards showing "Walk 1 mile without pain -- 80% complete."

---

### 10. Patient-Reported Outcome (PROM) Collection
**Priority: HIGH**

Automated outcome collection reduces clinical burden:
- **Scheduled surveys** -- auto-deliver at intake, mid-treatment, discharge, and follow-up
- **Standardized instruments** -- built-in validated measures (ODI, DASH, QuickDASH, LEFS, NDI)
- **Brief check-ins** -- single-question daily check: "How's your shoulder today?" 0-10
- **Pre-visit summaries** -- patient completes PROM before appointment, results available to therapist
- **Trend visualization** -- aggregate PROM scores displayed as trend lines
- **Alert thresholds** -- flag if PROM scores worsen significantly
- **Minimal burden** -- keep surveys under 2 minutes to maximize completion

**Design Pattern:** A weekly push notification: "Quick check-in: How has your knee felt this week?" Tapping opens a 3-question survey (pain, function, satisfaction) that takes <30 seconds. Results appear on both patient and therapist dashboards.

---

### 11. Accessibility for Older Adults & Limited Tech Users
**Priority: HIGH**

Many rehab patients are older adults with limited technology experience:
- **Large touch targets** -- minimum 48x48px buttons
- **High contrast text** -- WCAG AA minimum, prefer AAA for senior populations
- **Simplified navigation** -- bottom tab bar with max 4 items
- **Voice guidance** -- audio instructions for exercises (no reading required)
- **One-task-per-screen** -- don't overwhelm with too much information
- **Large fonts by default** -- minimum 16px body text, larger headings
- **No scrolling required** -- fit critical actions above the fold
- **Caregiver mode** -- allow family member to assist with app navigation
- **Offline-first** -- exercises work without internet after initial load
- **Simple login** -- remember me, biometric login (fingerprint/face)

**Design Pattern:** Default to a simplified "Easy Mode" with larger fonts, fewer options, and audio prompts. Allow switching to "Full Mode" in settings. Exercise cards show only: video thumbnail, exercise name, and a large green "Done" button.

---

### 12. Custom Exercise Video Recording
**Priority: MEDIUM**

Personalized videos improve adherence:
- **Therapist recording** -- clinicians record custom videos for their patients
- **Patient self-recording** -- patients record themselves for form review
- **Side-by-side playback** -- compare patient video to reference video
- **Voice-over instructions** -- therapists add custom audio instructions
- **Annotation tools** -- draw arrows and notes on video frames
- **Video library** -- organized by body part, diagnosis, and exercise type
- **Printable companion** -- generate QR-linked exercise sheet for non-tech patients

**Design Pattern:** Therapist interface includes "Record Video" button next to each exercise. After recording, can add voiceover and annotations. Patient sees a "Recorded just for you!" badge on custom videos. Non-tech patients receive a printed sheet with QR codes linking to their personalized videos.

---

### 13. Safety & Contraindication Warnings
**Priority: CRITICAL**

Safety must be designed into every exercise:
- **Stop-exercise criteria** -- clearly displayed: "Stop if you feel sharp pain, numbness, or tingling"
- **Red flag alerts** -- urgent symptoms that require immediate medical attention
- **Exercise modification options** -- easier/harder alternatives for each exercise
- **Contraindication checks** -- system flags if exercise conflicts with patient's conditions
- **Hold period indicators** -- how long to hold each stretch with visible countdown timer
- **Rest period timers** -- automatic rest countdown between sets
- **Maximum effort warnings** -- "Do not push through severe pain" reminders
- **Emergency contact button** -- one-tap to call therapist or emergency services

**Design Pattern:** Every exercise screen shows a yellow "Safety Notes" banner at the top (collapsible): "Stop if: Sharp pain, Numbness, Dizziness. Call your therapist if symptoms persist." A red "Get Help" button is always visible at the bottom right, linking to provider contact or 911.

---

### 14. Education Hub Integration
**Priority: MEDIUM**

Education improves engagement and outcomes:
- **Condition-specific articles** -- relevant reading based on patient's diagnosis
- **Video education library** -- short videos explaining conditions, treatments, expectations
- **FAQ section** -- common questions answered by the care team
- **Recovery timeline education** -- "What to expect at Week 2, Week 4, Week 8"
- **Lifestyle tips** -- ergonomics, sleep positions, activity modifications
- **Graded content** -- beginner, intermediate, advanced education levels
- **Bookmarking** -- patients can save articles for later reference
- **Provider-curated content** -- therapists select specific articles for each patient

**Design Pattern:** A "Learn" tab with cards organized by topic: "About Your Condition," "Recovery Timeline," "Daily Tips." Each card shows estimated read time. Therapists can pin articles to a patient's "My Education" list.

---

### 15. Multi-Language Support
**Priority: MEDIUM-HIGH**

Patient populations are increasingly diverse:
- **Auto-translated exercise instructions** -- one-click translation to 45+ languages
- **Native-language video captions** -- subtitles in multiple languages
- **Cultural considerations** -- respect cultural preferences for exercise settings
- **Right-to-left layout support** -- for Arabic, Hebrew, and similar languages
- **Provider-facing translation** -- therapist can send messages in patient's language
- **Audio narration in multiple languages** -- pre-recorded voice instructions

**Design Pattern:** A language selector in settings that auto-detects device language. Exercise instructions show a "Translate" button that converts text inline. Video players include subtitle language selection.

---

### 16. Telehealth Integration
**Priority: MEDIUM**

Virtual visits complement home exercise programs:
- **In-app video calls** -- HIPAA-compliant video chat with therapist
- **Screen sharing** -- therapist can demonstrate exercises during call
- **Exercise review during call** -- pull up patient's exercise log during session
- **Virtual check-ins** -- brief 5-minute form review calls between full sessions
- **Appointment scheduling** -- book telehealth sessions through the app
- **Post-visit summary** -- auto-generate notes from telehealth session
- **Recording option** -- patient can record exercise instructions during call (with consent)

**Design Pattern:** A "Call Your Therapist" button on the home screen opens a pre-call checklist ("Test your camera and microphone"). During the call, a floating "Show My Exercises" button shares the patient's exercise dashboard with the therapist.

---

### 17. Print & Offline Formats
**Priority: MEDIUM**

Not all patients can or will use the app:
- **PDF exercise program** -- generate printable exercise sheets with QR codes
- **QR-code linking** -- each printed exercise has a QR code linking to the video
- **Text message delivery** -- send exercise links via SMS for non-smartphone users
- **Email summaries** -- daily/weekly exercise summary via email
- **Caregiver printouts** -- format designed for family caregivers to follow along
- **Wall chart mode** -- large-format printable for pinning to refrigerator

**Design Pattern:** A "Print My Program" button generates a branded PDF with exercise photos, written instructions, QR codes for video links, and a handwritten completion checkbox area. QR codes link directly to the in-app exercise video.

---

### 18. Integration with Wearable Devices
**Priority: MEDIUM**

Wearable data enriches the home program picture:
- **Step count integration** -- track daily steps as part of functional goals
- **Heart rate monitoring** -- verify exercise intensity during prescribed activities
- **Sleep quality correlation** -- track sleep alongside pain and exercise adherence
- **Activity ring goals** -- sync with Apple Watch activity goals
- **Fall detection alerts** -- auto-notify therapist if patient has a fall event
- **Automatic completion detection** -- detect when patient completed a walk or activity

**Design Pattern:** A "Connected Devices" section in settings shows linked wearables. Exercise completion auto-detects if heart rate was elevated during the prescribed exercise window, offering a "Did you complete your exercises?" smart suggestion.

---\n
### 19. Care Team Coordination
**Priority: MEDIUM**

Multiple providers may be involved:
- **Multi-provider access** -- physical therapist, occupational therapist, physician all see same data
- **Role-based views** -- each provider type sees relevant data for their discipline
- **Shared care plans** -- coordinated goals across the care team
- **Referral tracking** -- show which providers referred the patient
- **Handoff notes** -- therapist-to-therapist communication about patient progress
- **Discharge planning** -- transition plan from therapy to self-management

**Design Pattern:** Provider dashboard includes a "Care Team" widget showing all providers involved with the patient. Each provider can add discipline-specific notes visible to the team but not the patient (unless explicitly shared).

---

### 20. Data Export & Portability
**Priority: MEDIUM**

Patients own their data:
- **FHIR export** -- download all health data in FHIR format
- **PDF summary** -- generate a summary of the complete home program and outcomes
- **Share with other providers** -- send exercise data and outcomes to referring physician
- **Insurance documentation** -- generate reports for insurance/prior authorization
- **Research participation** -- opt-in to share anonymized data for research
- **Account deletion** -- full data removal capability

**Design Pattern:** A "My Data" section in settings with options: "Download My Records (FHIR)," "Generate Summary PDF," "Share with Another Doctor." Each option includes clear explanations of what data is included.

---

### 21-30. Quick-Reference Design Principles

| # | Principle | Implementation |
|---|-----------|----------------|
| 21 | **Mobile-first** | Design for smartphone screens first; 80%+ of patients will use mobile |
| 22 | **Offline-first** | Cache all exercise videos and instructions locally |
| 23 | **Micro-interactions** | Subtle animations on completion: checkmarks animate, progress bars fill smoothly |
| 24 | **Biometric login** | Face ID / fingerprint for quick access (elderly patients struggle with passwords) |
| 25 | **Dark mode** | Reduce eye strain for patients doing evening exercises |
| 26 | **Haptic feedback** | Phone vibrates on completion for positive reinforcement |
| 27 | **Minimal cognitive load** | One task per screen; reduce decision-making burden |
| 28 | **Consistent timing** | All timers, animations, and transitions use consistent durations |
| 29 | **Error forgiveness** | Easy to undo accidental completions; editable entries |
| 30 | **Contextual help** | Question mark icons on every screen link to relevant help content |

---

## Reference: Leading HEP Apps Analyzed

| App | Key Strength | Platform | Notable Feature |
|-----|-------------|----------|-----------------|
| MedBridge GO | Gamification | iOS, Android | Streak tracking, looped video demos |
| PT Timer | Pacing & timing | iOS, iPad | Verbal cues, rep/set counters |
| Physitrack | Video library | Web, iOS, Android | 5,000+ exercise videos, multilingual |
| AC Health | Custom recording | iOS, Android | Record your own exercise videos |
| WebPT HEP | Provider integration | Web | StriveHub patient portal integration |
| PtEverywhere | All-in-one | Web, iOS, Android | Phase-based auto-progression |
| Rehab My Patient | AI planning | Web | AI-generated exercise plans |
| Constant Therapy | Cognitive rehab | iOS, Android | Condition-specific cognitive exercises |
| ReHand | Hand therapy | iOS, Android | Finger-specific ROM exercises |
| Curable Health | Pain neuroscience | iOS, Android | Pain education + graded motor imagery |

---

## Reference: Adherence Tracking Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Exercise Completion Rate** | % of prescribed exercises completed | >80% |
| **Session Adherence** | % of scheduled exercise days completed | >70% |
| **Exercise-Specific Adherence** | Completion rate per individual exercise | >75% per exercise |
| **Pain Trend** | Change in pain score over time | Decreasing trend |
| **Outcome Measure Change** | Improvement in standardized scores | MCID achieved |
| **Patient Satisfaction** | NPS or 5-star rating | >4.0/5.0 |
| **Message Response Rate** | % of patients responding to messages | >60% |
| **Return Visit Rate** | % of patients completing full plan of care | >85% |

---

## Sources
- MedBridge - Tracking Patient Adherence to Improve Outcomes
- WebPT - Home Exercise Program (HEP) Software
- PtEverywhere - Home Exercise Program Software
- Empower EMR - Physical Therapy Apps
- AC Health - Top 10 Patient Engagement Apps
- Exer Health - Best Physical Therapy Apps
- My OT Spot - Occupational Therapy Apps
- PMC - Mobile Task List for Inpatient Environments
- PMC - Medication Adherence Visualization
- Trinity Rehab - Physical Therapy Apps
- Rehab My Patient - Exercise Prescription Software
- Physitrack - Physical Therapy Exercise Library
- Kaiser Permanente - MedBridge Patient Portal
- Gaine - Patient Adherence Tracking
- McKesson - Medication Adherence Tools
- Cleveroad - Patient Portal Development 2025

---

*Report generated: 2025 | Research scope: Home exercise program and patient task tracking UX design*
