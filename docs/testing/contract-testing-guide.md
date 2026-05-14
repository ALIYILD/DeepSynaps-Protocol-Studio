# Contract Testing Guide — DeepSynaps Protocol Studio

> **Version:** 1.0  
> **Owner:** Test Infrastructure Team  
> **Review cycle:** Quarterly or after every OpenAPI schema change

---

## 1. Purpose

Contract tests verify that the **frontend API client** (`@deepsynaps/api-client`)
remains compatible with the **backend API** (`apps/api`). They catch
breaking changes in the OpenAPI schema before they are merged.

The contract is defined by:
- **`packages/api-client/openapi.json`** — the source of truth
- **`packages/api-client/src/openapi-types.ts`** — generated TypeScript types
- **Runtime API responses** — validated against the schema

---

## 2. Philosophy

> "The OpenAPI spec is the contract. The backend must honour it.
> The frontend must consume it. Tests prove both sides agree."

We use **consumer-driven contract testing**:

1. The frontend (consumer) defines expected request/response shapes.
2. The backend (provider) is tested against those expectations.
3. If either side drifts, CI fails before the code reaches staging.

---

## 3. Tools

| Tool | Purpose | Version |
|---|---|---|
| **OpenAPI Schema** | Contract definition | 3.1.0 |
| **openapi-typescript** | Generate TS types from JSON | ^7.13.0 |
| **Dredd** | Validate API responses against spec | ^14.0.0 |
| **Schemathesis** | Property-based API testing | ^3.24.0 |
| **JSON Schema validation** | Runtime response checks | `ajv` (frontend) |

---

## 4. Schema Generation & Validation

### 4.1 Generating TypeScript types

The frontend types are auto-generated from `openapi.json`:

```bash
cd packages/api-client
npm run generate   # Runs: openapi-typescript openapi.json -o src/openapi-types.ts
```

This should be re-run whenever:
- A backend PR modifies `app/main.py` route signatures
- A Pydantic schema (`BaseModel`) field changes
- New endpoints are added

### 4.2 Detecting schema drift in CI

The `api-client:check:drift` script compares the committed
`openapi.json` against a fresh export from the running API:

```bash
cd packages/api-client
npm run check:drift
```

If drift is detected, the script exits non-zero and CI fails.
This prevents merging a backend change without updating the client.

---

## 5. Contract Test Strategies

### 5.1 Strategy A: Type-level contract (compile-time)

The generated TypeScript types enforce the contract at build time:

```typescript
// packages/api-client/src/index.ts
import type { paths, components } from "./openapi-types";

// The frontend MUST use these types for all API calls.
// Any mismatch surfaces as a TypeScript error.
export type ProtocolResponse =
  paths["/api/v1/protocols/{protocol_id}"]["get"]["responses"]["200"]["content"]["application/json"];
```

**Coverage:** All API interactions.
**Speed:** Instant (tsc --noEmit).
**Limitation:** Only checks TypeScript code paths, not runtime responses.

### 5.2 Strategy B: Response validation (runtime)

Every API call in the frontend should validate the response against
the OpenAPI schema at runtime in test mode:

```typescript
// test-utils.ts — add to createMockApiClient
import Ajv from "ajv";
import openapiSchema from "../../../packages/api-client/openapi.json";

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateResponse(
  endpoint: string,
  method: string,
  statusCode: number,
  body: unknown
): void {
  const schema = openapiSchema.paths[endpoint]?.[method]?.responses[statusCode]
    ?.content?.["application/json"]?.schema;
  if (!schema) {
    throw new Error(`No schema found for ${method} ${endpoint} ${statusCode}`);
  }
  const valid = ajv.validate(schema, body);
  if (!valid) {
    throw new Error(
      `Response validation failed for ${method} ${endpoint}:\n` +
        ajv.errors!.map((e) => `  ${e.instancePath}: ${e.message}`).join("\n")
    );
  }
}
```

Usage in tests:
```typescript
const response = await mockApi.getProtocol("proto-123");
validateResponse("/api/v1/protocols/{protocol_id}", "get", 200, response);
```

**Coverage:** All mocked API responses in unit tests.
**Speed:** Fast (< 10 ms per validation).
**Limitation:** Only tests mock data, not the real API.

### 5.3 Strategy C: Provider contract tests (Dredd)

Dredd validates the real backend against the OpenAPI spec by making
actual HTTP requests:

```bash
# Install
npm install -g dredd

# Run against local API
npx dredd packages/api-client/openapi.json http://127.0.0.1:8000 \
  --hookfiles tests/load/dredd-hooks.js
```

**Coverage:** Every documented endpoint + status code.
**Speed:** Slow (seconds per endpoint).
**Limitation:** Requires a running API with seeded data.

### 5.4 Strategy D: Property-based contract tests (Schemathesis)

Schemathesis generates random valid requests to find edge cases:

```bash
# Install
pip install schemathesis

# Run against staging
st run packages/api-client/openapi.json \
  --base-url https://staging-api.deepsynaps.io \
  --checks all \
  --hypothesis-max-examples 100 \
  --show-errors-tracebacks
```

**Coverage:** Edge cases (empty strings, max-length values, Unicode).
**Speed:** Medium (minutes for full run).
**Limitation:** May generate requests that violate business rules;
filter with `--exclude-path` or `--include-method`.

---

## 6. CI Pipeline Integration

### 6.1 Contract test workflow

Add to `.github/workflows/contract-test.yml`:

```yaml
name: Contract Tests

on:
  pull_request:
    paths:
      - "packages/api-client/openapi.json"
      - "apps/api/**"
      - "apps/web/**"
  push:
    branches: [main]
    paths:
      - "packages/api-client/openapi.json"

jobs:
  schema-drift:
    name: Check OpenAPI drift
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - working-directory: packages/api-client
        run: npm run check:drift

  typecheck-frontend:
    name: Type-check frontend against schema
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run typecheck --workspace @deepsynaps/api-client
      - run: npm run typecheck --workspace @deepsynaps/web

  dredd-provider:
    name: Dredd provider tests
    runs-on: ubuntu-latest
    services:
      api:
        image: deepsynaps/api:staging
        ports:
          - 8000:8000
        env:
          DEEPSYNAPS_APP_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g dredd
      - run: |
          npx dredd packages/api-client/openapi.json http://127.0.0.1:8000 \
            --reporter junit \
            --output dredd-results.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dredd-results
          path: dredd-results.xml

  schemathesis:
    name: Schemathesis property tests
    runs-on: ubuntu-latest
    services:
      api:
        image: deepsynaps/api:staging
        ports:
          - 8000:8000
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install schemathesis
      - run: |
          st run packages/api-client/openapi.json \
            --base-url http://127.0.0.1:8000 \
            --checks all \
            --hypothesis-max-examples 50 \
            --junit-xml schemathesis-results.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: schemathesis-results
          path: schemathesis-results.xml
```

### 6.2 PR checklist

When a PR changes the OpenAPI schema:

- [ ] Regenerate `openapi-types.ts`: `npm run generate --workspace @deepsynaps/api-client`
- [ ] Run drift check: `npm run check:drift --workspace @deepsynaps/api-client`
- [ ] Type-check frontend: `npm run typecheck --workspace @deepsynaps/web`
- [ ] Run Dredd locally: `npx dredd openapi.json http://127.0.0.1:8000`
- [ ] Update contract tests if endpoint signatures changed
- [ ] Update this document if new strategies are added

---

## 7. Handling Breaking Changes

### 7.1 Classification

| Severity | Example | Action |
|---|---|---|
| **Critical** | Required field removed, endpoint deleted | Block merge, coordinate migration |
| **Major** | Field type changed, enum value removed | Update frontend, bump client major version |
| **Minor** | New optional field added | Merge safe, update types |
| **Patch** | Description updated, example changed | Merge safe, no action |

### 7.2 Migration workflow

1. Backend PR adds the new field / endpoint (backward-compatible).
2. Frontend PR consumes the new contract.
3. After both deploy, backend PR removes the deprecated field.

**Never** remove a field without at least one release cycle of
deprecation warning (`@deprecated` in OpenAPI + `console.warn` in client).

---

## 8. Mock API Client Contract Compliance

All mock API clients (`createMockApiClient` in `test-utils.tsx`) must
produce responses that conform to the OpenAPI schema. To enforce this:

1. Import the `validateResponse` helper from section 5.2.
2. Call it after defining mock implementations:

```typescript
const mockApi = createMockApiClient({
  getProtocol: vi.fn().mockImplementation((id: string) => {
    const response = mockProtocol({ id });
    validateResponse("/api/v1/protocols/{protocol_id}", "get", 200, response);
    return Promise.resolve(response);
  }),
});
```

This guarantees that frontend tests break immediately when the contract
changes, rather than failing mysteriously in staging.

---

## 9. Directory Structure

```
packages/api-client/
├── openapi.json                 # Source of truth (committed)
├── src/
│   ├── index.ts                 # Client implementation
│   └── openapi-types.ts         # Generated (do NOT edit manually)
├── scripts/
│   ├── generate-types.mjs       # openapi-typescript wrapper
│   └── check-drift.mjs          # Compare committed vs exported schema

tests/
├── load/
│   ├── locustfile.py
│   └── load-test-config.yml
└── contract/                    # (future)
    ├── dredd-hooks.js
    └── fixtures.yml             # Dredd example request/response data
```

---

## 10. Further Reading

- [OpenAPI 3.1.0 Specification](https://spec.openapis.org/oas/v3.1.0)
- [openapi-typescript docs](https://openapi-ts.dev/)
- [Dredd documentation](https://dredd.readthedocs.io/)
- [Schemathesis documentation](https://schemathesis.readthedocs.io/)
- [Pact (alternative contract testing framework)](https://pact.io/)
