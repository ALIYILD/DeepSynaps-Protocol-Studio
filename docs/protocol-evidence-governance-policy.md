# Protocol evidence governance — Condition packages

**Audience:** Clinical governance, medical directors, package editors, engineering (generation/export).  
**Scope:** All JSON under `data/conditions/*.json`, downstream handbooks, consent blocks, and patient-facing copy derived from those packages.  
**Related schema:** `data/schemas/condition-package.schema.json` (`protocol` object); Pydantic: `packages/core-schema/src/deepsynaps_core_schema/condition_package.py`.

This policy does **not** define what is medically appropriate in any jurisdiction; it defines **how DeepSynaps packages must represent** evidence, uncertainty, and regulatory facts so editors apply a **consistent, conservative** bar.

---

## 1. Principles (non-negotiable)

1. **Regulatory status ≠ efficacy.** FDA clearance/CE marking/other marketing authorization answers “may this device be sold/used for an indication in a given market,” not “this protocol will work for this patient.”
2. **Adjacent-condition evidence ≠ this-condition evidence.** A trial in disorder X does not support the same parameters for disorder Y unless explicitly justified and labeled.
3. **Mechanism plausibility ≠ clinical benefit.** Neurobiological narrative may motivate research but must not be stated as established efficacy.
4. **Citation hygiene.** Every protocol’s `references` must plausibly support what `evidence_summary` claims. Mismatched montage, species, or indication requires **explicit disclosure** in `evidence_summary` or the protocol must be **downgraded / retired**.
5. **Separate channels.** Clinician sections may contain more technical detail than patient sections; patient sections must not contain **stronger** efficacy claims than the protocol record supports.

---

## 2. Current schema levers (what we already have)

Each protocol may set:

| Field | Purpose |
|-------|--------|
| `evidence_grade` | `EV-A` … `EV-D` — strength of **direct human evidence for this condition + modality + core parameters** (see §4). |
| `on_label_vs_off_label` | `On-label` / `Off-label` / `Investigational` — **device/indication regulatory** relationship, not trial quality. |
| `patient_facing_allowed` | Whether patient-facing artifacts may cite this protocol without redaction. |
| `clinician_review_required` | Whether a named clinician must approve before use in exports. |
| `governance.patient_export_allowed` | Whether protocol may appear on patient-directed exports. |
| `governance.requires_clinician_sign_off` | Hard gate for protocol use. |
| `governance.off_label_acknowledgement_required` | Signed acknowledgement for off-label use. |
| `governance.dual_review_required` | Optional second reviewer for high-risk cases. |

**Gap:** The schema does not yet encode “montage mismatch” or “indirect evidence only” as structured flags. Until extended, these MUST be spelled out in `evidence_summary` and/or `governance.notes`.

---

## 3. Operational protocol status (editor-facing)

Use this **status** in editorial discussion and changelog; map to JSON fields as below.

| Status | Meaning | Default JSON posture |
|--------|---------|----------------------|
| **A — Standard-supported** | At least one **high-quality** human body of evidence (e.g., guideline-endorsed, or multiple adequate RCTs/meta-analyses) for **this condition** with **parameters not materially different** from the package protocol. | `evidence_grade`: EV-A or EV-B; `on_label_vs_off_label`: usually On-label when device-backed; `requires_clinician_sign_off`: per org policy (often true for clinical exports); `patient_facing_allowed`: may be true if language is proportionate. |
| **B — Limited evidence** | Some direct human data for this condition, but **small trials**, **high risk of bias**, **single study**, or **important endpoints not replicated**. | `evidence_grade`: EV-B (borderline) or EV-C; sign-off **required** before patient-facing use; tighten patient wording. |
| **C — Exploratory / experimental** | Pilot data, **parameter mismatch** with cited studies, **adjacent** indication only, or **indirect** (e.g., biomarker only). | `evidence_grade`: EV-C or EV-D; `on_label_vs_off_label`: often Off-label or Investigational; `patient_facing_allowed`: **false** unless simplified “research/experimental” copy approved; `requires_clinician_sign_off`: **true**; `off_label_acknowledgement_required`: **true** if off-label. |
| **D — Retire / remove** | Fraudulent citations, **irreconcilable** parameter mismatch without clinical owner acceptance, or evidence base **contradicted** by authoritative systematic review for the same claim. | Remove from `protocol_bundle` or mark deprecated in release notes; do **not** ship in patient exports. |

**Downgrade path:** A → B → C is expected when independent reviews (e.g., large VA/AHRQ-style syntheses) contradict earlier optimistic summaries.

---

## 4. Evidence grade (EV-A–D) — governance definitions

Use **for this package’s condition** unless `evidence_summary` explicitly scopes to another population.

| Grade | When to use |
|-------|-------------|
| **EV-A** | Guideline-level or multiple confirmatory trials; parameters align; outcomes clinically meaningful; little controversy in recent independent reviews. |
| **EV-B** | Solid but not definitive: fewer trials, narrower populations, or moderate risk of bias; still **direct** human evidence for the **same** condition class. |
| **EV-C** | Emerging: pilots, indirect extension from related conditions, or **known mismatch** between cited studies and packaged parameters **disclosed in text**. |
| **EV-D** | Hypothesis-only, case series, or predominantly non-human / theoretical support; or human evidence is **contradicted** by stronger independent syntheses—use sparingly and pair with retirement review. |

---

## 5. Decision matrix: weak / indirect / mismatched / off-label / no direct evidence

| Situation | Action |
|-----------|--------|
| **Weak but direct** human evidence (small RCT, bias) | Set **B — Limited**; EV-B or EV-C; sign-off; soften all patient claims; add monitoring. |
| **Indirect** (e.g., evidence in depression, applied to anxiety without bridging trials) | **C — Exploratory**; EV-C minimum; `evidence_summary` must name the gap; patient copy **no benefit promises**; off-label ack if applicable. |
| **Montage / dose / schedule ≠ cited paper** | **C — Exploratory** unless clinical lead signs a written **equivalence rationale** stored outside JSON (link in `governance.notes` if desired); default **patient_facing_allowed: false**. |
| **FDA cleared for indication** but systematic review says **insufficient efficacy** | **Do not** use clearance to justify EV-A/B for efficacy; separate sentences: clearance vs trial evidence; consider **B** or **C** for efficacy narrative. |
| **Off-label or investigational device use** | `Off-label` or `Investigational`; `off_label_acknowledgement_required: true`; patient text explains **not standard care**. |
| **No direct human evidence** for condition | **C** or **D**; default **retire** from patient pathways; if kept for research templates, `Investigational` + no patient export. |
| **Bogus / wrong references** | **Immediate D**; remove or fix before any merge. |

---

## 6. Wording rules by section

### 6.1 Condition overview (`condition_overview`)

- State **non-device standard of care** where relevant (e.g., CBT-I for insomnia) at a **high level**—without replacing licensed clinical judgment.
- **Avoid** numeric efficacy from single sources unless cited and bounded (“trials vary…”).
- **Neurobiology:** use “models suggest,” “may,” “heterogeneous,” not “proves” or “establishes cure.”

### 6.2 Protocol (`protocol_bundle` entries)

- **`evidence_summary`:** First sentence = **directness** (what was actually studied). Second = **alignment** with this protocol’s parameters. Third = **limitations** (bias, N, mismatch).
- **`references`:** Only items that **literally** support a claim in the summary; mismatch must be **acknowledged in prose**, not hidden.
- **Never** imply sham quality or blinding better than sources report.

### 6.3 Handbook (`handbook_outputs`)

- **Clinician handbook:** May include “if / then” selection logic and **explicit** evidence limits (“not interchangeable with [citation] montage”).
- **Technician SOP:** Operational steps only; **no** efficacy superlatives (“proven,” “gold standard neuromodulation”).
- **Patient guide:** Must be **weaker** than or equal to protocol evidence; if protocol is C, patient guide must not read like marketing.

### 6.4 Consent (`consent_documents`)

- Always **separate** paragraphs: (1) regulatory status, (2) **what trials actually show**, (3) **uncertainty / alternatives**, (4) **right to stop**.
- Required when **`off_label_acknowledgement_required`** or exploratory status: patient acknowledges **non-standard** therapy.

### 6.5 Patient-friendly explanation (`patient_friendly_explanation`)

- **Banned** without medical affairs review: “FDA approved/cleared **so it works**,” “no side effects,” “guaranteed,” “cures.”
- **Preferred:** “Some people improve,” “evidence is mixed,” “your clinician will track symptoms,” “this is not the only option.”

---

## 7. Governance flag recommendations (by status)

| Status | `requires_clinician_sign_off` | `patient_export_allowed` | `patient_facing_allowed` | Off-label ack |
|--------|------------------------------|--------------------------|----------------------------|---------------|
| A — Standard-supported | Org policy (often true) | Usually true | True with proportionate text | If off-label |
| B — Limited evidence | **true** | True with caution | True with softened copy | If off-label |
| C — Exploratory | **true** | **false** unless exceptional | **false** default | **true** if off-label |
| D — Retire | n/a | **false** | **false** | n/a |

`dual_review_required` should be considered for **C** when exporting to vulnerable populations or when combining **parameter mismatch** + **off-label**.

---

## 8. Editor checklist (per protocol, each release)

- [ ] **Directness:** Is the cited evidence for **this ICD/DSM condition** (or is scope clearly stated)?
- [ ] **Parameter match:** Montage, intensity, sessions, and population match the citation within accepted clinical tolerance; if not, is mismatch **in `evidence_summary`**?
- [ ] **Independent review:** Have high-quality systematic reviews been checked where they exist (e.g., major ESP/Cochrane)?
- [ ] **Regulatory:** Is **clearance** language separated from **efficacy** language everywhere (protocol, handbook, consent, patient)?
- [ ] **Patient parity:** Is patient copy **weaker** than clinician copy?
- [ ] **Export flags:** Do `patient_export_allowed` / `patient_facing_allowed` match the **operational status** (§3)?
- [ ] **Failure mode:** If evidence is downgraded, are **handbook and consent** updated in the **same** edit?

---

## 9. Worked examples (real governance patterns)

### 9.1 Montage mismatch

**Scenario:** Package encodes cathodal **R-DLPFC** sponge tDCS for insomnia; cited paper uses **HD-tDCS** over **DMPFC** with different electrode layout.  
**Classification:** **C — Exploratory** for efficacy claims about *this* montage.  
**JSON:** `evidence_grade`: EV-C or EV-D; `evidence_summary` states “citation uses different montage; not validated for parameters herein”; `patient_facing_allowed`: false; `requires_clinician_sign_off`: true.

### 9.2 FDA clearance vs efficacy evidence

**Scenario:** CES device is **FDA-cleared** for insomnia; an independent systematic review concludes **insufficient** evidence for clinically important insomnia outcomes.  
**Classification:** **B — Limited** or **C** for *efficacy narrative*; clearance remains factual for regulatory sentences only.  
**Copy rule:** “Cleared for marketing” in one sentence; “trial evidence is limited/conflicting” in the next—**never** merged into one implication.

### 9.3 Adjacent-condition evidence

**Scenario:** rTMS evidence in **MDD** used to justify protocol text in **GAD** without GAD-specific trials.  
**Classification:** **C — Exploratory** unless GAD-specific evidence is added.  
**JSON:** `on_label_vs_off_label` may still be On-label for device **if** indication exists—but **efficacy** language must not copy MDD outcomes.

### 9.4 Indirect biomarker / mechanism only

**Scenario:** qEEG “signature” and hyperarousal model support **phenotype** description but no RCT links that biomarker to treatment response for this protocol.  
**Classification:** Phenotype text = **hypothesis**; protocol efficacy must not rest on biomarker alone—**C** or keep biomarker out of `evidence_summary` except as “rationale for future research.”

---

## 10. Implementation notes

- **Repo consistency:** Older packages may show `patient_facing_allowed: true` with **optimistic** copy; editors should align them to this policy over time, not assume historical JSON is compliant.
- **Schema evolution (optional):** Future additions could include `evidence_directness: direct | indirect | mechanistic_only` and `parameter_alignment_with_citations: full | partial | none_disclosed` to reduce reliance on free-text discipline alone.

---

## 11. External clinical skill layers

Any external skill library integrated into DeepSynaps, including curated
OpenClaw skills, is treated as an **untrusted drafting and retrieval layer**,
not as an autonomous clinical authority.

1. **Allowlist only.** External skills must be reviewed individually. Bulk
   imports of upstream skill packs are not allowed.
2. **Mandatory wrapper.** Every external skill output must pass through
   `deepsynaps_safety_engine.wrap_openclaw_skill_output(...)` or an equivalent
   gate that records:
   - source skill name
   - evidence level
   - clinical claim type
   - off-label risk flag
   - `requires_clinician_review: true`
   - patient-facing safe copy allowed: true/false
3. **No bypass paths.** External skills may not directly trigger patient export,
   clinician sign-off, protocol activation, or safety overrides.
4. **Protocol claims require citations.** Any protocol or neuromodulation claim
   produced through an external skill must carry citations before it can be
   stored, rendered, or exported.
5. **Off-label handling.** If an external skill suggests off-label or
   investigational neuromodulation content, the wrapper must set the off-label
   flag before any downstream use, and patient-facing reuse must remain blocked
   unless a clinician-safe rewrite is approved.
6. **Out-of-scope capabilities.** External skills that diagnose, prescribe,
   guarantee benefit, auto-authorize, auto-deny, or make autonomous clinical
   decisions are not allowed to run inside this policy boundary.

## 12. Document control

| Version | Date | Notes |
|---------|------|------|
| 1.1 | 2026-05-04 | Added external clinical skill layer policy and mandatory wrapper requirements for curated third-party skills. |
| 1.0 | 2026-04-12 | Initial policy aligned with schema and recent package refreshes (e.g., anxiety, insomnia). |

**Owner:** Clinical governance / medical affairs (assign named role).  
**Review cadence:** Annually or after major guideline or regulatory shifts affecting neuromodulation indications.
