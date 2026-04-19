# APIFY E-Cells Results — 5 Remaining Evidence Gaps

**Generated:** 2026-04-17
**Operator:** Claude (Opus 4.7, 1M ctx)
**Apify status:** UNAVAILABLE — `APIFY_TOKEN` not set in environment, `apify` CLI not installed.
**Fallback:** Free PubMed MCP (`mcp__claude_ai_PubMed__*`). $0 spent. Apify cap of $20 fully respected (not touched).
**Original baseline:** EXTERNAL-ecells-draft.md "Apify escalation candidates" §5.

---

## Per-Cell Outcomes

| # | Cell | Outcome | Spend | New Protocol IDs |
|---|---|---|---|---|
| 1 | CES × Neuropathic Pain | **Negative evidence** — no protocol | $0 | none |
| 2 | PBM × Long COVID | **Insufficient/borderline** — no protocol drafted | $0 | none |
| 3 | NFB × Schizophrenia | **Draft produced** | $0 | PRO-034 |
| 4 | taVNS × ADHD | **Insufficient** — no protocol | $0 | none |
| 5 | PBM × Parkinson's | **Draft produced** (expanded beyond NCT06036433) | $0 | PRO-035, PRO-036 |

**Total spend:** $0.00 (Apify path not entered)
**New protocols drafted:** 3 (PRO-034, PRO-035, PRO-036)

---

## 1. CES × Neuropathic Pain — NEGATIVE EVIDENCE

**Search:** "cranial electrotherapy stimulation neuropathic pain" + Allison 2023 systematic review review.

**Key papers reviewed:**
- **Palmer A et al. 2024** — PMID 38419716 — *Front Neurol* — Burning Mouth Syndrome RCT (n=22, double-blind, sham-controlled). 100 µA CES 60 min/day x 28 days. **Result: active CES NOT superior to sham** (both 36% responders; Fisher's exact p=1.00). DOI 10.3389/fneur.2024.1343093.
- **Allison DJ et al. 2023** — PMID 37428448 — *J Spinal Cord Med* — Systematic review of pain interference in SCI neuropathic pain. Reviewed 2 active CES studies. CES NOT among interventions with moderate-to-high quality benefit. Pregabalin, gabapentin, intrathecal baclofen, tDCS, TENS were beneficial; CES was not. DOI 10.1080/10790268.2023.2218186.
- **Koukoulithras I et al. 2023** — PMID 37644939 — *Cureus* — SCI pain systematic review. 12 studies on rTMS/tDCS/CES for SCI pain. tDCS and rTMS reduced pain; CES not separately endorsed. DOI 10.7759/cureus.42657.

**Verdict:** Negative-trial dominance (1 sham-controlled RCT failed) + 2 systematic reviews placing CES below the evidence threshold for neuropathic pain. **No protocol row generated.** Logged as negative evidence so clinicians know we looked.

---

## 2. PBM × Long COVID — INSUFFICIENT (BORDERLINE)

**Search:** "photobiomodulation long COVID randomized controlled trial".

**Key papers reviewed:**
- **Lim L et al. 2026** — PMID 41768981 — *EClinicalMedicine* — itPBM for PCC brain fog. RCT n=43 (23 active, 20 sham), Vielight Neuro RX Gamma device, 8 weeks daily 20-min itPBM. **Primary cognitive endpoint NOT significant** (mean diff 0.043, p=0.088). Significant in <45y subgroup (p=0.028, exploratory). Mobility favored sham (p=0.007). DOI 10.1016/j.eclinm.2025.103730.
- **Parreira LFS et al. 2024** — PMID 38416635 — *Photobiomodul Photomed Laser Surg* — RCT n=70 for COVID dysgeusia. 18 spots tongue (3J/spot), salivary glands, carotid 60J. PBM superior to sham at weeks 7-8 (p=0.048). DOI 10.1089/photob.2023.0148.
- **Cardoso Soares P et al. 2023** — PMID 37947919 — *Lasers Med Sci* — 6-arm RCT for COVID-related taste impairment. 660/808 nm, no statistical superiority between groups. DOI 10.1007/s10103-023-03917-9.

**Verdict:** Only ONE sham-controlled RCT for cognitive/fatigue brain fog (Lim 2026), and its primary endpoint failed. Two RCTs target dysgeusia (oral, not the brain-fog/fatigue indication of clinical interest). The existing draft protocol `p-lcf-001` already exists in protocols-data.js with Grade D — appropriate. **No new protocol row added.** Recommend leaving p-lcf-001 in place and updating its references to include Lim 2026 in a future curation pass.

---

## 3. NFB × Schizophrenia — PROTOCOL DRAFTED (PRO-034)

**Search:** "neurofeedback schizophrenia randomized" — 29 results post-2018, evidence base substantially expanded post-2025.

**Key papers (verified PMIDs):**
- **Duan Y et al. 2025** — PMID 40225850 — *Front Psychiatry* — Meta-analysis of 14 RCTs, N=1371. EEG-NF + pharmacotherapy: positive symptoms SMD=-0.87, negative symptoms SMD=-1.28. Best with ≥4 sessions/week × ≥8 weeks targeting SMR + beta. DOI 10.3389/fpsyt.2025.1537329.
- **Bauer CCC et al. 2025** — PMID 40886445 — *Psychiatry Res Neuroimaging* — RCT n=23, real-time fMRI NFB targeting STG vs sham (motor cortex). Both reduced AHs; real-NFB produced greater reductions in STG-DLPFC connectivity. DOI 10.1016/j.pscychresns.2025.112050.
- **Shu IW et al. 2025** — PMID 40445258 — *Appl Psychophysiol Biofeedback* — Double-blind RCT, gamma coherence NFB. Active NFB improved working memory vs placebo NFB. DOI 10.1007/s10484-025-09716-y.
- **Zhang J et al. 2025** — PMID 40236821 — *Depress Anxiety* — RCT n=25, rt-fMRI NFB STG-targeted, predicts AH improvement via DMN-DLPFC connectivity. DOI 10.1155/da/2848929.
- **Narang A et al. 2026** — PMID 41653801 — *Asian J Psychiatry* — Open-label RCT n=68 (34 NFB + 34 wait-list). 15 sessions theta/beta NFB improved attention, vocational task speed/accuracy/productivity. DOI 10.1016/j.ajp.2026.104880.
- **Schilirò G et al. 2026** — PMID 41712163 — *Appl Psychophysiol Biofeedback* — Systematic review (10 RCTs + 4 clinical trials). Improvements in processing speed, social functioning, working memory; AH-region modulation reproducible. DOI 10.1007/s10484-026-09773-x.

**Parameters extracted from Duan 2025 meta:** ≥4 sessions/week × ≥8 weeks, SMR (12-15 Hz) and low-beta protocols, EEG-NF adjunctive to pharmacotherapy. Grade B (meta-analysis-anchored).

---

## 4. taVNS × ADHD — INSUFFICIENT

**Search:** "transcutaneous auricular vagus nerve stimulation ADHD" + "taVNS attention deficit hyperactivity disorder".

**Key papers reviewed:**
- **Chai D et al. 2025** — PMID 40955201 — *Neuropsychiatr Dis Treat* — **Animal model (rat)** — taVNS in WKY/SHR rat ADHD model, lipidomics. NOT human evidence. DOI 10.2147/NDT.S530564.
- **Zhi J et al. 2024** — PMID 39697776 — *Front Neurosci* — Mechanism review (NE pathway in PFC), no RCT. DOI 10.3389/fnins.2024.1494272.
- **Wang W et al. 2024** — PMID 39444752 — *Front Physiol* — VNS cognitive review, ADHD listed as future application only. DOI 10.3389/fphys.2024.1452490.
- **Zhu S et al. 2022** — PMID 36313768 — *Front Endocrinol* — Pediatric review, ADHD listed in "potential applications". DOI 10.3389/fendo.2022.1000758.

**Verdict:** ZERO human RCTs of taVNS for ADHD exist on PubMed (April 2026). Only an animal model and three narrative reviews. **No protocol row generated.** Insufficient evidence; do not pad with case reports or animal data.

---

## 5. PBM × Parkinson's — PROTOCOL DRAFTED (PRO-035, PRO-036)

**Search:** "photobiomodulation Parkinson disease randomized controlled trial". Re-verified beyond NCT06036433 (which is a registered helmet-trial protocol; corresponds to McGee 2022 PMID 36061601 protocol paper and Herkes 2023 PMID 38094162 results paper).

**Key papers (verified PMIDs):**
- **Herkes G et al. 2023** — PMID 38094162 — *EClinicalMedicine* — Double-blind RCT n=40, SYMBYX tPBM helmet, 24 min/day × 6d/wk × 12 wk, red 635 nm + IR 810 nm LEDs. Safe, well-tolerated. Modified MDS-UPDRS-III change favoring active in sham-to-active arm (sham 26.8→20.4; active 20.4→12.2) but no significant between-group difference at any single timepoint. DOI 10.1016/j.eclinm.2023.102338.
- **McGee C et al. 2023** — PMID 37109183 — *J Clin Med* — Same dataset, post-hoc motor analysis. ~70% of active participants responded (≥5 MDS-UPDRS-III decrease). Facial and lower-limb sub-scores improved with active. DOI 10.3390/jcm12082846.
- **Battesha HHM et al. 2025** — PMID 41114920 — *Lasers Med Sci* — RCT n=38 (50-70y) tPBM × 12 wk. Posture stability and functional activity improved (p<0.05 vs control). DOI 10.1007/s10103-025-04628-z.
- **Santos L et al. 2025** — PMID 41171380 — *J Neural Transm* — RCT n=72, 4 arms (exercise, PBM 808 nm, exercise+PBM, control) × 6 mo. PBM improved posturography; no synergy with exercise. NCT05152706. DOI 10.1007/s00702-025-03050-7.
- **Bullock-Saxton J et al. 2021** — PMID 34092640 — *J Alzheimers Dis* — Pilot RCT n=22, combined transcranial + intra-oral PBM (904 nm, 60 mW/diode, 50 Hz, 33s × 21 points). Spiral test + dynamic step test improved with regular treatment. DOI 10.3233/JAD-210170.
- **Liebert A et al. 2021** — PMID 34215216 — *BMC Neurol* — Proof-of-concept n=12, 12-wk transcranial+intranasal+neck+abdominal PBM, sustained improvements at 1 yr. DOI 10.1186/s12883-021-02248-y.
- **Santos L et al. 2019** — PMID 30824206 — *Brain Stimul* — RCT letter, prior small trial. DOI 10.1016/j.brs.2019.02.009.

**Parameters anchor (Herkes 2023):** 635 nm + 810 nm LEDs, 24 min/session, 6 days/week, 12 weeks (72 total sessions), home-delivered helmet (SYMBYX). Grade B (multiple RCTs, mixed efficacy outcomes but consistent safety + responder subgroup).

**Two protocol rows generated** to differentiate (a) transcranial helmet protocol and (b) combined transcranial + intra-oral protocol — they are clinically and parametrically distinct.

---

## PMID Verification Pass

All PMIDs cited above were retrieved live from PubMed via `mcp__claude_ai_PubMed__get_article_metadata` (not from training data). Each new protocol row's primary citation has been verified to return real article metadata.

| Protocol | Primary PMID | Verified | DOI |
|---|---|---|---|
| PRO-034 (NFB-SCZ) | 40225850 | YES | 10.3389/fpsyt.2025.1537329 |
| PRO-035 (PBM-PD helmet) | 38094162 | YES | 10.1016/j.eclinm.2023.102338 |
| PRO-036 (PBM-PD combined intra-oral) | 34092640 | YES | 10.3233/JAD-210170 |

---

## Files Modified

1. `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/APIFY-ecells-results.md` (this file, new)
2. `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/data/imports/clinical-database/protocols.csv` (PRO-034, PRO-035, PRO-036 appended)
3. `/Users/aliyildirim/Desktop/DeepSynaps-Protocol-Studio/apps/web/src/protocols-data.js` (3 entries appended to PROTOCOL_LIBRARY before manual templates)

## Files NOT Modified

- No git operations performed.
- No Apify calls made (token unavailable; cap of $20 untouched).

---

*All cells traceable to verified PMID. No parameters fabricated. Where abstracts omit a parameter, blank + `verify` flag. Review_Status=Unreviewed on all new rows. Clinician sign-off required before clinical use.*
