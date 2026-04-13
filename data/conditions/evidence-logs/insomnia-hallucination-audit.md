# Hallucination audit — `insomnia.json`

## Materially false references (removed)

| Location | Problem | Resolution |
|----------|-----------|------------|
| `PRO-TDCS-INS-01.references` | **Frase et al. 2016** cited for insomnia — paper is tACS in genetic absence epilepsy **rats**, not human insomnia | Deleted |
| | **Lustenberger et al. 2012** — creativity/alpha oscillations, not insomnia tDCS | Deleted |
| `PRO-CES-INS-01.references` | **Lichtbroun 2001 fibromyalgia** irrelevant to insomnia CES efficacy | Deleted |

## Overstated efficacy claims (softened)

| Topic | Issue | Resolution |
|-------|--------|------------|
| Shekelle 2018 | Package claimed “moderate-quality evidence” for insomnia — **opposite** of VA summary language | Rewritten to match NBK493128: **insufficient** evidence for clinically important insomnia effects |
| CES | “EV-B” + “first-line neuromodulation” | Downgraded to **EV-C**, require clinician sign-off; CBT-I remains clinical first-line per AASM |
| Regulatory vs clinical | FDA clearance treated as proof of strong benefit | Separated **device marketing** from **trial evidence** throughout handbook, patient text, consent |

## Claims verified / retained

- **Morin 2011**-style ISI change benchmarks (package already cited Morin et al. 2011 for ≥8-point change) — consistent with published ISI psychometric work.  
- **Li et al. 2025** — used only to illustrate **human insomnia tDCS RCT exists** with **explicit disclaimer** that montage differs from `PRO-TDCS-INS-01`.

## Residual risk

- Phenotype **qEEG “signatures”** remain hypothesis-level (not individually sourced in this run).  
- Neurofeedback protocol references were **not** re-verified end-to-end in this session.
