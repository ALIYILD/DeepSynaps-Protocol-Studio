# Deploying the evidence pipeline

How to get the evidence search live for clinicians on the `deepsynaps-studio`
Fly app. One-time setup; after that, only a monthly refresh is needed.

## Prerequisites

```
fly auth login                         # if not already
fly status -a deepsynaps-studio        # sanity-check the app exists
```

Required API keys (keep them in `~/.zshrc` locally; set as Fly secrets for prod):

| Key                 | Where to get it                                                           |
|---------------------|---------------------------------------------------------------------------|
| `NCBI_API_KEY`      | https://www.ncbi.nlm.nih.gov/account/settings/                            |
| `UNPAYWALL_EMAIL`   | Any real email you control (Unpaywall uses the email as the auth token)   |
| `OPENFDA_API_KEY`   | https://open.fda.gov/apis/authentication/                                 |

## 1. Push secrets to Fly

```bash
fly secrets set \
  NCBI_API_KEY=...                \
  UNPAYWALL_EMAIL=you@domain.com  \
  OPENFDA_API_KEY=...             \
  -a deepsynaps-studio
```

`EVIDENCE_DB_PATH=/data/evidence.db` is already set in `apps/api/fly.toml [env]`
and lands on the existing 1 GB persistent volume (`deepsynaps_data` → `/data`).

## 2. Deploy

```bash
fly deploy -a deepsynaps-studio
```

Ship the code. The image now includes `/app/services/evidence-pipeline/` and the
`/api/v1/evidence/*` router. Clinicians can open the Evidence Library and see a
"Evidence database not ingested yet" message — correct, until step 3.

## 3. One-shot ingest (~45 minutes)

```bash
fly ssh console -a deepsynaps-studio -C \
  'python3 /app/services/evidence-pipeline/ingest.py --all --papers 200 --trials 150 --fda 200 --events 100 --unpaywall'
```

After it finishes:

```bash
# Extract structured stim params from the trial interventions.
fly ssh console -a deepsynaps-studio -C \
  'python3 /app/services/evidence-pipeline/extract_protocols.py'
```

## 4. Verify

```bash
# Public, no auth — used by the landing page Evidence Matrix header.
curl -s https://deepsynaps-studio.fly.dev/api/v1/evidence/stats | python3 -m json.tool

# Expected: {"ok": true, "counts": {"papers": ~6000, "trials": ~1500, "indications": 20}}

# Authenticated, full health:
curl -s -H "Authorization: Bearer $TOKEN" \
  https://deepsynaps-studio.fly.dev/api/v1/evidence/health | python3 -m json.tool

# Spot-check a search:
curl -s -H "Authorization: Bearer $TOKEN" \
  'https://deepsynaps-studio.fly.dev/api/v1/evidence/papers?indication=rtms_mdd&limit=3' \
  | python3 -m json.tool
```

## 5. Monthly refresh (set up once)

Add a Fly cron, or just set a calendar reminder to re-run step 3 monthly.
Ingest is **idempotent** — it upserts by PMID/DOI/NCT, so re-running is safe and
incrementally picks up new papers.

```bash
# Example — run locally on the first Monday of each month:
fly ssh console -a deepsynaps-studio -C \
  'python3 /app/services/evidence-pipeline/ingest.py --all --unpaywall && \
   python3 /app/services/evidence-pipeline/extract_protocols.py'
```

## 6. Rotating keys

```bash
# Rotate NCBI key (example):
fly secrets set NCBI_API_KEY=new-40-char-key -a deepsynaps-studio
# No redeploy needed; secrets hot-reload on next process restart.
fly apps restart deepsynaps-studio
```

## Troubleshooting

| Symptom                                        | Diagnosis                                                                 |
|------------------------------------------------|---------------------------------------------------------------------------|
| `/stats` returns `{ok: false, counts: {}}`     | `/data/evidence.db` missing — run step 3.                                 |
| `/papers` returns 503                          | Same as above, authenticated path.                                        |
| Landing page stats still show fallback numbers | CDN cached the JS bundle; deploy bumped the hash, hard-refresh the page.  |
| FDA rows include unrelated devices             | Modality missing from `MODALITY_PRODUCT_CODES`; verify codes via `scripts/verify_product_codes.py`. |
| PubMed hits slowed after a while               | Drop to `--papers 100` and split into two SSH runs, or run with `OPENFDA_API_KEY`/`NCBI_API_KEY` unset — the pipeline still works at 3 req/s. |
| `extract_protocols.py` confidence is mostly `low` | Trial descriptions in that indication don't follow "Hz / pulses / sessions" phrasing. Not a bug — the extractor prefers silence to speculation. Add indication-specific regexes only if you can verify them. |

## What NOT to do

- Do **not** commit `evidence.db` — it's >100 MB after ingest, gitignored for a
  reason. Rebuild via SSH instead.
- Do **not** set `EVIDENCE_DB_PATH` outside `/data/` — the rest of the volume
  layout expects it there and non-volume paths lose data on redeploy.
- Do **not** enable an unauthenticated path other than `/stats` — any endpoint
  that returns actual paper / trial / device content must stay behind
  `get_authenticated_actor`.
