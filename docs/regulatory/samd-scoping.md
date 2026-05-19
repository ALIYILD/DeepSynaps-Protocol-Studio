# FDA Software as a Medical Device (SaMD) — Scoping Document

> **DECISION-SUPPORT DOCUMENT, NOT A REGULATORY DETERMINATION.**
>
> This file presents the regulatory landscape and DeepSynaps's
> positioning under each option so that the operator + qualified
> regulatory counsel can make the classification decision required
> by must-have #4 of the 2026-05-19 Clinician Workflow OS audit.
>
> Nothing in this file is filed, registered, or asserted to any
> regulator. Every "DeepSynaps is …" sentence is provisional and
> must be confirmed against the live product before any external
> claim is made.

---

## Why this document exists

The CWOS audit (PR #1073, must-have #4) frames the choice as:

> "FDA SaMD scoping decision — for Protocol Selector, qEEG/MRI
> Analyzers, Safety Monitor: Class II 510(k) requiring predicate +
> labeling, or decision-support non-device with 'Decision-support
> only. Not a medical device.' labeling? Current state … treated
> as non-device decision-support. This needs an explicit operator
> decision before external pilot."

This document does **not** make that decision. It lays out:

1. The FDA + IMDRF SaMD framework
2. DeepSynaps's clinical functions, mapped to the framework
3. The de-facto current stance the codebase already implements
4. What each path forward would require
5. Open questions the operator + regulatory counsel must answer

It is upstream of `predicate-analysis.md`, `q-submission-draft.md`,
and `iec-62304-lifecycle.md`. Those documents assume the SaMD
classification has been made; this one helps make it.

---

## 1. What "SaMD" means here

The IMDRF defines Software as a Medical Device (SaMD) as

> "software intended to be used for one or more medical purposes
> that perform these purposes without being part of a hardware
> medical device."

The FDA aligns with this definition under 21 CFR 880 and references
IMDRF SaMD: Possible Framework for Risk Categorization and
Corresponding Considerations (Sept 2014).

Software that **only** provides decision support to a licensed
clinician who retains the treatment decision can be exempt from
device regulation under the 21st Century Cures Act amendments to
section 520(o) of the FD&C Act — the "Clinical Decision Support
(CDS) carve-out" (CDS Final Guidance, FDA, Sept 2022).

The carve-out's four-prong test (paraphrased):

| Prong | Requirement |
|---|---|
| (1) | NOT intended to acquire / process / analyze a medical image, signal from an in vitro diagnostic device, or pattern / signal from a signal acquisition system |
| (2) | Intended to display / analyze / print medical info about a patient or other medical info (e.g. clinical guidelines) |
| (3) | Intended to support / provide recommendations to a HCP about prevention, diagnosis, or treatment of a disease or condition |
| (4) | Intended to enable the HCP to **independently review the basis** for the recommendation and **not rely primarily** on it |

Software that satisfies ALL FOUR is non-device CDS. Failing ANY ONE
makes the software a device subject to FDA regulation (most likely
510(k) Class II, occasionally De Novo or PMA depending on risk).

---

## 2. The IMDRF four-tier SaMD risk matrix

If DeepSynaps is determined to be a device, the IMDRF framework
ranks risk on two axes:

**Significance of information provided** — does the software
inform, drive, or determine the clinical management decision?

**State of the healthcare situation/condition** — non-serious,
serious, or critical patient condition?

| Significance × Condition | Non-serious | Serious | Critical |
|---|---|---|---|
| **Treat / diagnose** | II | III | IV |
| **Drive clinical management** | I | II | III |
| **Inform clinical management** | I | I | II |

Categories I–IV correspond to escalating regulatory rigour. In FDA
parlance, this roughly maps to:

* I → exempt or 510(k) Class I
* II → 510(k) Class II
* III → De Novo or 510(k) Class II with stronger controls
* IV → PMA Class III

---

## 3. DeepSynaps's clinical functions (today)

This is the audit-honest list of functions that could trigger SaMD
classification, with the de-facto current positioning per the
codebase as of 2026-05-19:

| Function | Code surface | Today's stance |
|---|---|---|
| Protocol Studio recommendation | `apps/web/src/pages-protocols.js`, `apps/api/app/routers/protocol_studio_router.py`, `apps/api/app/services/protocol_studio_recommend.py` | Decision-support; clinician retains protocol selection. "Decision-support only" disclaimer on every generator output. |
| Treatment course activation | `apps/api/app/routers/treatment_courses_router.py::activate_course` | Clinician-driven. Dual-review gate (PR #1093). Off-label acknowledgement gate (PR #1097/#1115). |
| qEEG Brain Map analyzer | `apps/api/app/services/qeeg_report_template.py`, `apps/web/src/pages-qeeg-*.js` | Analyzes signal from acquisition system → likely **fails CDS prong (1)**. Currently labelled "Decision-support only". |
| MRI analyzer | `apps/api/app/routers/mri_analysis_router.py`, `mri-deepdive-architecture.md` | Analyzes medical image → **fails CDS prong (1)**. Currently labelled "Decision-support only". |
| QEEG protocol fit / suggestion | `apps/web/src/qeeg-protocol-fit.js`, `pages-qeeg-launcher.js` | Pattern analysis from acquisition signal → **fails CDS prong (1)**. |
| Safety monitor (adverse events) | `apps/api/app/routers/adverse_events_router.py`, monitoring surfaces | Inform-only; tracks signals, clinician acts. |
| Off-label flagging UI | `apps/web/src/pages-protocols.js`, governance badges | Inform-only labeling layer. |
| Patient-facing dashboards | `pages-patient-portal.js`, wellness, home tasks | Patient-facing display; not provider-facing CDS. |
| AI clinical note generation | `clinician-dictation`, `ai-note-assistant` | Drafts that clinician edits + signs. Inform-only assistive. |

### Honest observations

* **qEEG, MRI, and QEEG-protocol-fit features analyze patterns from signal/image acquisition systems** — that is the precise scope of CDS prong (1) that excludes software from the carve-out. These three function families cannot plausibly qualify as non-device CDS under the 2022 Final Guidance, regardless of how prominently the disclaimer is shown.

* **Protocol Studio recommendation, course activation, safety monitor, off-label flagging, and AI note drafting** are each plausibly within the CDS carve-out, provided prong (4) — clinician independently reviews the basis and does not rely primarily on the software — is genuinely supported by the UI. The codebase already enforces this with the dual-review gate, the off-label acknowledgement gate, and the "Decision-support only" disclaimer pattern. Whether prong (4) actually holds is a clinical-workflow + UX question, not a code question, and requires expert review.

---

## 4. The three paths forward

### Path A — Bifurcated: non-device CDS for ProtocolStudio + safety; SaMD lane for qEEG/MRI analyzers

Most likely the intended outcome based on current code. Keep
Protocol Studio + safety monitor + off-label flagging + AI note
drafting as non-device CDS with explicit "Decision-support only.
Not a medical device." labeling. Carve out qEEG analyzer, MRI
analyzer, and qEEG protocol fit as separate device(s) and either:

* file 510(k) under predicate (per `predicate-analysis.md` template, anchoring on Flow FL-100 / approved qEEG analyzers as predicates), OR
* gate access to those features behind "investigational use only" labeling and IRB-approved research protocols (no commercial pilot).

**Pros:** Aligns with how the codebase is already structured. Smallest filing surface. Existing disclaimers + governance gates already in place for the CDS portion.
**Cons:** qEEG/MRI features are the most clinically differentiated parts of the platform — leaving them as "investigational" caps commercial reach. Filing 510(k) for each requires ≥1 predicate per indication and a substantial-equivalence package per FDA 510(k) guidance.

### Path B — Whole-platform non-device CDS

Argue every feature satisfies the CDS carve-out, including qEEG
and MRI analyzers, by emphasizing the clinician-in-the-loop UX
and the "Decision-support only" labeling.

**Pros:** No 510(k) filing. Fastest path to pilot.
**Cons:** The CDS Final Guidance is explicit that prong (1)
disqualifies software analyzing signal/image acquisition. FDA
warning letters have cited this exact prong against radiology
AI labelled as "decision support." This path almost certainly
fails on prong (1) for qEEG + MRI features. Pursuing it without
qualified regulatory counsel sign-off is a significant
enforcement risk.

### Path C — Whole-platform SaMD lane

File every feature as a device. Most defensible posture; highest
filing cost; longest time-to-pilot.

**Pros:** No ambiguity. Aligned with the IMDRF SaMD framework. Strongest claims posture.
**Cons:** 9–18 months to clearance per function family. Filing fees, QSR build-out, post-market surveillance commitments. Substantially heavier IEC 62304 / ISO 14971 / 21 CFR Part 820 burden than the existing scaffolding (`iec-62304-lifecycle.md` template) anticipates.

---

## 5. International parallel — UKCA + CE-MDR + MHRA

DeepSynaps is incorporated in the UK. For any pilot run on UK soil
the relevant frameworks are:

* **UK Medical Devices Regulations 2002** (as amended) — UKCA mark
  via UK Approved Body
* **MHRA Software and AI as a Medical Device** programme — running consultations are likely to align UK SaMD treatment with the IMDRF framework. As of this document, MHRA accepts CE-marked devices under the post-Brexit transitional arrangement (extended through 2030 per the 2024 update).
* **EU MDR 2017/745** — for any pilot in the EU. MDR Annex VIII Rule 11 classifies software intended to provide information used to make decisions for diagnosis / therapeutic purposes as **Class IIa minimum**; if used in serious deterioration / death contexts, Class IIb or III.

MDR Rule 11 is **stricter** than the FDA framework. Under MDR Rule
11 alone, ProtocolStudio's recommendation function would likely be
Class IIa or IIb — there is no broad CDS carve-out equivalent to
21 CFR 880 in the EU.

UK pilots: UKCA mark or CE-MDR conformity required regardless of
the FDA path.

---

## 6. Recommendation matrix

Given current code state, business stage (pre-pilot), and the
existing regulatory scaffolding in this repo:

| Question | Recommended provisional stance | Confidence |
|---|---|---|
| Protocol Studio recommendation | Non-device CDS, with prong-(4) labeling already in place | Moderate |
| Treatment course activation | Workflow tool, non-device | High |
| Off-label flagging | Informational labeling, non-device | High |
| AI clinical note drafting | CDS-adjacent, non-device IF every output requires clinician sign-off before persistence | Moderate (depends on UX details) |
| qEEG Brain Map analyzer | SaMD Class II — file 510(k) OR restrict to research-only labeling pending filing | Low confidence on the "research-only restriction is safe" claim — needs counsel |
| MRI analyzer | SaMD Class II — same as qEEG | Same |
| qEEG protocol fit | SaMD Class II (analyzes signal-derived pattern) — same | Same |
| Safety monitor | Non-device monitoring tool | Moderate |
| EU/UK pilot | MDR Rule 11 Class IIa minimum for the recommendation features; UKCA / CE-MDR required regardless of FDA path | High |

**Net suggested provisional path:** Path A (bifurcated). Keep the
CDS surfaces explicitly outside the device boundary with strong
labeling + clinician-in-the-loop gates (already largely in place).
Treat qEEG / MRI / qEEG-protocol-fit as a separate, scoped device
lane requiring 510(k) filing OR research-only restriction. This
matches the codebase's current de-facto stance and the existing
scaffolding in `predicate-analysis.md`.

---

## 7. Open questions the operator + regulatory counsel must answer

These are decision points this document **cannot** make:

1. **Which jurisdictions for the first pilot?** Decides whether FDA, UK MHRA, EU MDR, or all three apply at pilot launch.
2. **Will pilot be commercial, research-IRB-protected, or hybrid?** A research-IRB pilot can use the qEEG/MRI features under investigational-use labeling without a 510(k); a commercial pilot cannot.
3. **Predicate device selection for qEEG analyzer 510(k)?** `predicate-analysis.md` currently lists Flow FL-100 as a tDCS predicate placeholder, which is wrong for qEEG. A qEEG-specific predicate (e.g. NeuroGuide, qEEG-Pro, or eVox per FDA-cleared qEEG analytics) must be identified.
4. **Predicate device for MRI analyzer 510(k)?** Likely an existing FDA-cleared structural MRI quantification or volumetric tool (e.g. FastSurfer / FreeSurfer-derived clinical tools, NeuroQuant, IcoBrain, Quantib). The codebase's current `mri-deepdive-architecture.md` references FastSurfer; the production predicate would need to be a cleared device, not FastSurfer itself (which is research software).
5. **AI note drafting — is the sign-off step legally sufficient prong-(4) coverage?** Or does the AI output's influence on the final note disqualify the CDS carve-out? This is currently an open FDA enforcement question for generative AI in clinical documentation.
6. **Quality system maturity.** A 510(k) filing requires a functioning QMS under 21 CFR 820. Current state: scaffolding only (`iec-62304-lifecycle.md`). What's the timeline to build the QMS to passable state?
7. **Sponsor responsibilities under EU MDR + MHRA.** Who is the legal manufacturer / Authorised Representative for non-UK pilots?

---

## 8. What this document does NOT do

* Make any classification claim binding on DeepSynaps or its operator.
* Substitute for regulatory counsel review.
* Promise any timeline, fee, or filing outcome.
* Pre-empt the FDA / MHRA / EU MDR notified body determination.
* Override `predicate-analysis.md`, `q-submission-draft.md`, or `iec-62304-lifecycle.md` — those documents assume the classification this document helps make.

---

## 9. Provenance

* IMDRF/SaMD WG/N12FINAL:2014 — "Software as a Medical Device":
  Possible Framework for Risk Categorization and Corresponding
  Considerations.
* FDA "Clinical Decision Support Software" Final Guidance, Sept 2022.
* 21 CFR 880 (general hospital and personal use devices).
* 21st Century Cures Act § 3060 (amending FD&C 520(o)).
* EU MDR 2017/745, Annex VIII Rule 11.
* MHRA Software and AI as a Medical Device programme, current
  workstream as of 2026-05-19.

Each citation is current as of 2026-05-19. Regulatory documents
update; verify before any external reliance.

---

**Status: scoping artifact. Awaiting operator decision per CWOS
audit must-have #4. Linked from `docs/regulatory/README.md`.**
