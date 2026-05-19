# Category 8 — License Provisioning Runbook

Two of the five diagnosis-coding sources are **license-gated** and ship
`degraded` by default:

| Source | Required env | License path |
|---|---|---|
| UMLS | `UMLS_API_KEY` | NLM UTS account (free for research) |
| SNOMED CT | `SNOMEDCT_SNOWSTORM_URL` (+ optional `SNOMEDCT_BRANCH`, `SNOMEDCT_AUTH_TOKEN`) | SNOMED Affiliate License + a licensed Snowstorm endpoint |

The remaining three (ICD-10-CM, MeSH, OLS) are public-domain or per-ontology
licensed and need no provisioning.

This runbook is **operations-only**. It does not change any code path or
data semantics. After provisioning, `/api/v1/diagnosis/sources` should
flip the corresponding source from `degraded / missing_license` to
`registered / available`.

---

## 1. UMLS (NLM UTS)

### 1.1 Get a UTS account

1. Visit https://uts.nlm.nih.gov/uts/signup-login.
2. Sign up with an institutional or research email. Approval typically
   takes 1–3 business days.
3. After approval, log in → **My Profile** → **Edit Profile** → copy the
   **API Key** (a UUID-shaped string).

### 1.2 Store the key as a Fly secret

```bash
fly secrets set UMLS_API_KEY=<uts-api-key> -a deepsynaps-studio
```

Fly will restart the app's machines automatically; no extra deploy step
needed.

### 1.3 Verify it reaches the process

UMLS goes through the standard env path, so no `env_passthrough` config
is needed for the API container. If you've added a separate worker that
needs UMLS access, add it to its `[env]` block in the relevant fly.toml.

### 1.4 Smoke-test live

```bash
curl -sS https://deepsynaps-studio.fly.dev/api/v1/diagnosis/sources \
  | jq '.sources[] | select(.key=="umls")'
```

Expected after provisioning:

```json
{
  "key": "umls",
  "registered": true,
  "status": "registered",
  "available": true,
  "license_required": true,
  "source_name": "UMLS"
}
```

Followed by a real query:

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"term":"depression","limit":3}' \
  https://deepsynaps-studio.fly.dev/api/v1/diagnosis/normalize \
  | jq '.matches_by_source.umls'
```

Expected: a list of `{code, display, ...}` UMLS CUIs (e.g. `C0011570
Major depressive disorder, recurrent episode`).

### 1.5 License compliance reminders

- UMLS Metathesaurus contains source-specific restrictions (SNOMED CT,
  MedDRA, etc.) that are *more* restrictive than the umbrella UMLS
  license. Treat returned codes accordingly.
- UTS requires annual login + usage reporting. Calendar a reminder.
- Do not redistribute UMLS-derived datasets without separate permission.

---

## 2. SNOMED CT (Snowstorm)

There is **no free unauthenticated public SNOMED CT browse API**. The
adapter requires a licensed Snowstorm endpoint. Options, in increasing
order of effort:

### 2A. Use your national release centre's hosted browser

Some member countries expose Snowstorm-compatible endpoints to licensed
affiliates. Examples:

- **US**: NLM SNOMED CT browser (UMLS subset; see UMLS provisioning above
  — the UMLS adapter already covers SNOMED CT cross-walking via CUIs).
- **UK**: NHS Term Browser (`https://termbrowser.nhs.uk`) — affiliate
  licence required; the API path varies by deployment, contact NHS
  Digital.

### 2B. Self-host Snowstorm

1. Obtain a SNOMED CT Affiliate License → https://www.snomed.org/get-snomed.
2. Download a release archive (RF2) from your national release centre.
3. Run Snowstorm — the canonical docker setup:
   ```bash
   docker run -d --name snowstorm \
     -p 8080:8080 \
     -v "$PWD/data:/snomed" \
     snomedinternational/snowstorm:latest
   # Load the release:
   docker exec -it snowstorm snowstorm-import \
     /snomed/SnomedCT_InternationalRF2_PRODUCTION_<release>.zip
   ```
4. Expose it on a private network reachable from Fly (private DNS, a
   small VPC peer, or a public-but-auth-gated proxy). **Never expose
   unauthenticated SNOMED content publicly** — that's a licence breach.

### 2C. License a managed Snowstorm SaaS

Some vendors offer hosted Snowstorm-compatible terminology services. If
you go this route, get a stable HTTPS URL and (usually) a bearer token.

### 2.2 Store the endpoint as Fly secrets

```bash
fly secrets set \
  SNOMEDCT_SNOWSTORM_URL="https://your-snowstorm.example.invalid" \
  SNOMEDCT_BRANCH="MAIN" \
  SNOMEDCT_AUTH_TOKEN="<bearer-token-if-required>" \
  -a deepsynaps-studio
```

The `_AUTH_TOKEN` is only needed if your Snowstorm requires a bearer
token. `_BRANCH` defaults to `MAIN`.

### 2.3 Smoke-test live

```bash
curl -sS https://deepsynaps-studio.fly.dev/api/v1/diagnosis/sources \
  | jq '.sources[] | select(.key=="snomedct")'
```

Expected after provisioning:

```json
{
  "key": "snomedct",
  "registered": true,
  "status": "registered",
  "available": true,
  "license_required": true,
  "source_name": "SNOMED CT"
}
```

Then:

```bash
curl -sS -X POST -H "Content-Type: application/json" \
  -d '{"term":"depression","limit":3}' \
  https://deepsynaps-studio.fly.dev/api/v1/diagnosis/normalize \
  | jq '.matches_by_source.snomedct'
```

Expected: a list of `{code, display, ...}` SNOMED CT concept IDs (e.g.
`370143000 Major depressive disorder, single episode, severe`).

### 2.4 License compliance reminders

- **Affiliate License ≠ redistribution licence.** Do not export SNOMED
  CT content to clients who are not themselves SNOMED Affiliates.
- Display the SNOMED CT trade-mark attribution wherever concept IDs are
  surfaced to end users.
- Annual reporting may be required by your national release centre.

---

## 3. Rollback

If a license expires or a Snowstorm endpoint goes down, the adapters
degrade gracefully — the API stays up, the affected source reports
`status: degraded` (UMLS) or `status: down` (SNOMED if the endpoint is
configured but unreachable), and downstream callers receive a warning
in the response payload.

To remove a license cleanly:

```bash
fly secrets unset UMLS_API_KEY -a deepsynaps-studio
fly secrets unset SNOMEDCT_SNOWSTORM_URL SNOMEDCT_BRANCH SNOMEDCT_AUTH_TOKEN \
  -a deepsynaps-studio
```

Then re-verify `/api/v1/diagnosis/sources` shows the sources back to
`degraded / missing_license`.

---

## 4. Decision-support reminder

Even when both UMLS and SNOMED CT are healthy, the Category 8 endpoints
remain **decision support only**. Provisioning a license does **not**
upgrade the API to a diagnostic, eligibility, or coverage-decision
service. The `decision_support_disclaimer` field on every response
remains mandatory.
