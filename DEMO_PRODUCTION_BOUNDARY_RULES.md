# DeepSynaps Protocol Studio — Demo/Production Boundary Rules

> **Classification:** CRITICAL SECURITY DOCUMENT  
> **Version:** 1.0.0  
> **Owner:** Security Engineering  
> **Review Cycle:** Monthly  
> **Effective Date:** Immediate  
> **Applies To:** All environments (development, staging, production)  
> **Enforcement:** CI gates, runtime checks, database constraints, deployment blocks  

---

## TABLE OF CONTENTS

1. [THE FUNDAMENTAL RULE](#1-the-fundamental-rule)
2. [CRITICAL FINDINGS](#2-critical-findings)
3. [DETECTION RULES](#3-detection-rules)
4. [ENFORCEMENT RULES](#4-enforcement-rules)
5. [REMEDIATION PLAN](#5-remediation-plan)
6. [BOUNDARY RULES BY FEATURE](#6-boundary-rules-by-feature)
7. [AUDIT TRAIL REQUIREMENTS](#7-audit-trail-requirements)
8. [VERIFICATION SCRIPT](#8-verification-script)
9. [APPENDICES](#9-appendices)

---

## 1. THE FUNDAMENTAL RULE

### 1.1 The Non-Negotiable Principle

> **RULE F-1 (ABSOLUTE):** Demo data, synthetic data, mock data, and any data not originating from a real clinical source MUST NEVER coexist with, be stored alongside, or be retrievable through the same endpoints, database tables, or API responses as production clinical data. There are ZERO exceptions.

### 1.2 Explicit Opt-In Requirement

> **RULE F-2:** Demo mode MUST be explicitly opt-in via a multi-step activation process. Demo mode MUST NEVER be silently enabled, auto-enabled, or enabled by default in any environment labeled "production," "prod," "live," or serving real patient data.

The activation process MUST require:

1. **Explicit environment variable:** `DEEPSYNAPS_DEMO_MODE=1` (value "1" only)
2. **Non-production environment check:** `APP_ENV` must be one of: `development`, `dev`, `test`, `testing`, `staging`, `local`
3. **Database-level allowlist:** The `demo_mode_config` table must have a row with `environment=<current_env>` AND `enabled=true`
4. **Administrative approval log:** A row in `demo_activation_log` with `approved_by` and `approval_timestamp` within the last 24 hours
5. **Banner display:** A visible warning banner rendered on every page/API response

If ANY of these five conditions is not met, demo mode MUST remain disabled and any attempt to activate it MUST be logged as a `CRITICAL` security event.

### 1.3 Endpoint Labeling Requirement

> **RULE F-3:** Every API endpoint that can return demo data MUST have a URL path containing `/demo/` or a query parameter `?demo=1` with explicit opt-in. No endpoint outside the `/demo/` path tree MAY return demo data under any circumstance.

### 1.4 Response Flagging Requirement

> **RULE F-4:** Every HTTP response containing demo data MUST include:
> - Header: `X-Demo-Mode: true`
> - Header: `X-Clinical-Grade: synthetic`
> - Body field (JSON): `"_meta": { "demo": true, "data_source": "synthetic", "clinical_validity": "none" }`
> - Status code suffix: Comments in OpenAPI docs marking the response schema as `DemoResponse<T>`

### 1.5 Data Separation at Rest

> **RULE F-5:** Demo data MUST be stored in a physically or logically separate database/schema from production clinical data. The separation MUST be enforced at the database permission level — the production database user MUST NOT have read or write access to demo schemas, and vice versa.

### 1.6 Data Separation in Transit

> **RULE F-6:** Any API response that includes demo data MUST NOT also include production clinical data in the same payload. A response is either 100% demo or 100% production — mixed responses are forbidden.

### 1.7 The Cascade Rule

> **RULE F-7:** If ANY service in a request call chain detects demo mode, the ENTIRE response MUST be flagged as demo, regardless of whether other services returned production data. Demo mode is infectious — one demo component taints the entire response.

---

## 2. CRITICAL FINDINGS

### 2.1 Finding CRIT-001: MRI_DEMO_MODE Enabled in Production

**Severity:** CRITICAL — P0  
**Status:** ACTIVE VIOLATION  
**File:** `fly.toml` (production deployment manifest)

```toml
# CURRENT VIOLATION — DO NOT DEPLOY WITH THIS CONFIGURATION
[env]
MRI_DEMO_MODE = "1"  # <-- VIOLATION: Demo mode enabled in production
```

**Impact:** When real MRI processing fails, the system falls back to generating synthetic/demo MRI analysis data and returns it to clinicians who may make treatment decisions based on fabricated results.

**Root Cause:** The `MRI_DEMO_MODE` environment variable defaults to enabled in the production deployment manifest. There is no environment-based gating — the variable is hardcoded to `"1"`.

**Immediate Action Required:**
```toml
# CORRECTED CONFIGURATION
[env]
MRI_DEMO_MODE = "0"  # NEVER set to "1" in production
```

### 2.2 Finding CRIT-002: Environment Variable Backdoor in Demo Seeding

**Severity:** CRITICAL — P0  
**Status:** ACTIVE VULNERABILITY  
**File:** `demo_clinic_seed.py`

```python
# CURRENT VULNERABILITY
def demo_seed_enabled(env: str) -> bool:
    """Check if demo clinic seeding is enabled for this environment."""
    return env in ("development", "test") or os.environ.get("DEEPSYNAPS_DEMO_CLINIC_SEED") == "1"
    # ^-- VIOLATION: Any environment can trigger demo seed via env var
```

**Impact:** An attacker or misconfiguration can set `DEEPSYNAPS_DEMO_CLINIC_SEED=1` in production and the system will seed synthetic patients, courses, and queues into the production database.

**Root Cause:** The `or` clause allows bypassing the environment check via an environment variable.

**Immediate Action Required:**
```python
# CORRECTED — Enforce environment-based gating with explicit allowlist
def demo_seed_enabled(env: str) -> bool:
    """Check if demo clinic seeding is enabled for this environment."""
    # ONLY these environments may ever seed demo data
    allowed_envs = {"development", "dev", "test", "testing", "local", "staging"}
    
    if env not in allowed_envs:
        # Log attempt and return False — never seed in production
        logger.critical(f"Demo seed blocked in non-allowed environment: {env}")
        return False
    
    # Even in allowed environments, require explicit opt-in
    return os.environ.get("DEEPSYNAPS_DEMO_CLINIC_SEED") == "1"
```

### 2.3 Finding CRIT-003: Missing Demo Detection in API Responses

**Severity:** HIGH  
**Status:** ACTIVE VULNERABILITY

No middleware, response wrapper, or API layer currently checks whether returned data originates from demo sources. The system does not:
- Add `X-Demo-Mode` headers to responses
- Flag demo data in JSON response bodies
- Log when demo data is served
- Reject requests for demo data from production endpoints

### 2.4 Finding CRIT-004: Demo Users Without Environment Restriction

**Severity:** HIGH  
**Status:** ACTIVE VULNERABILITY  
**File:** Lifespan startup hook

```python
# CURRENT — Only checks environment, no additional gating
if settings.app_env not in ("development", "test"):
    return  # skips demo user seed
```

**Issues:**
1. The string check `not in ("development", "test")` is fragile — a typo in `app_env` (e.g., `"develepment"`) passes the check and seeds demo users
2. No check for `PYTEST_CURRENT_TEST` is performed here (unlike clinic seeding)
3. No audit log entry is created when demo users are seeded
4. Demo user emails (`clinician@example.com`, `admin@example.com`) have no environment restriction

### 2.5 Finding CRIT-005: MRI Demo Fallback Is Silent

**Severity:** CRITICAL — P0  
**Status:** ACTIVE VIOLATION

When MRI processing fails, the code path falls back to demo mode WITHOUT:
- Raising an exception
- Returning an error response
- Adding a `X-Demo-Mode` header
- Logging at `ERROR` or `CRITICAL` level
- Notifying operators

A clinician receives fabricated MRI analysis data indistinguishable from real data.

### 2.6 Finding CRIT-006: No CI/CD Gate for Demo Configuration

**Severity:** HIGH  
**Status:** PROCESS GAP

The CI/CD pipeline does not scan deployment manifests (e.g., `fly.toml`) for demo mode flags before production deployment. A pull request adding `MRI_DEMO_MODE = "1"` would be merged and deployed without detection.

---

## 3. DETECTION RULES

Every detection rule has three components: **Trigger**, **Detection Mechanism**, and **Alert Action**.

### 3.1 Rule DET-001: Demo Data Query in Production

| Component | Specification |
|-----------|--------------|
| **Name** | Demo Data Query in Production |
| **Severity** | CRITICAL |
| **Trigger** | Any database query targets tables with names containing `demo`, `seed`, `synthetic`, or `mock` in a production environment |
| **Detection** | SQL query interceptor in the ORM middleware scans all `SELECT`, `INSERT`, `UPDATE`, `DELETE` statements for table names matching `/demo_|_demo|seed_data|synthetic_|mock_/i` when `APP_ENV == "production"` |
| **Alert** | Immediate `CRITICAL` alert to security team + PagerDuty page + automatic incident ticket creation |
| **Auto-Action** | Query is blocked and connection is terminated |

**Implementation:**
```python
# detection/query_interceptor.py
import re
import os
from sqlalchemy import event
from sqlalchemy.engine import Engine

DEMO_TABLE_PATTERN = re.compile(r'\b(demo_|_demo|seed_data|synthetic_|mock_)\b', re.IGNORECASE)
PRODUCTION_ENVS = {"production", "prod", "live"}

@event.listens_for(Engine, "before_cursor_execute")
def detect_demo_query(conn, cursor, statement, parameters, context, executemany):
    """Detect and block demo table access in production."""
    env = os.environ.get("APP_ENV", "unknown").lower()
    
    if env in PRODUCTION_ENVS and DEMO_TABLE_PATTERN.search(statement):
        logger.critical(
            f"DET-001 VIOLATION: Demo table query blocked in production. "
            f"Query: {statement[:200]}... "
            f"Source: {conn.engine.url.database}"
        )
        raise DemoDataLeakageError(
            "Demo data access is forbidden in production. "
            "This incident has been reported to the security team."
        )
```

### 3.2 Rule DET-002: Missing X-Demo-Mode Header

| Component | Specification |
|-----------|--------------|
| **Name** | Missing Demo Response Header |
| **Severity** | HIGH |
| **Trigger** | A response body contains demo-flagged data but the response lacks `X-Demo-Mode: true` header |
| **Detection** | Response middleware scans outgoing JSON for `"_meta.demo": true` or `"data_source": "synthetic"` and validates that `X-Demo-Mode` header is present |
| **Alert** | `HIGH` alert to security team + automatic header injection + incident log |
| **Auto-Action** | Header is forcibly added, response is logged for investigation |

**Implementation:**
```python
# detection/response_validator.py
class DemoResponseValidator:
    """Validates that demo responses carry proper headers."""
    
    DEMO_INDICATORS = [
        ('_meta', 'demo', True),
        ('data_source', None, 'synthetic'),
        ('clinical_validity', None, 'none'),
        ('patient_type', None, 'synthetic'),
    ]
    
    @classmethod
    def is_demo_payload(cls, body: dict) -> bool:
        """Check if a response body contains demo data."""
        for key_path, sub_key, expected in cls.DEMO_INDICATORS:
            value = cls._get_nested(body, key_path)
            if sub_key and isinstance(value, dict) and value.get(sub_key) == expected:
                return True
            if not sub_key and value == expected:
                return True
        # Check for known demo identifiers
        if any(demo_id in str(body) for demo_id in ['demo-', 'DEMO-', 'synth-', 'MOCK-']):
            return True
        return False
    
    @staticmethod
    def _get_nested(d: dict, path: str):
        keys = path.split('.')
        for key in keys:
            if isinstance(d, dict):
                d = d.get(key)
            else:
                return None
        return d
```

### 3.3 Rule DET-003: Example.com Email Access in Production

| Component | Specification |
|-----------|--------------|
| **Name** | Example.com Domain Email Usage |
| **Severity** | HIGH |
| **Trigger** | Any authentication or data access event involves an email address ending in `@example.com` |
| **Detection** | Authentication middleware and API access logs filter for email patterns matching `*@example.com`, `*@test.com`, `*@localhost` |
| **Alert** | `HIGH` alert — immediate investigation required |
| **Auto-Action** | Authentication is blocked for `@example.com` addresses in production |

**Known demo accounts to monitor:**
- `clinician@example.com`
- `admin@example.com`
- `demo@example.com`
- `test@example.com`
- `patient@example.com`

**Implementation:**
```python
# detection/email_validator.py
DEMO_EMAIL_DOMAINS = {
    "example.com", "test.com", "localhost", 
    "example.org", "example.net", "mailinator.com"
}

def is_demo_email(email: str) -> bool:
    """Check if an email address is a known demo account."""
    if not email or "@" not in email:
        return False
    domain = email.split("@")[-1].lower()
    return domain in DEMO_EMAIL_DOMAINS

def validate_email_not_demo(email: str, env: str) -> None:
    """Block demo email usage in production."""
    if env in PRODUCTION_ENVS and is_demo_email(email):
        logger.critical(f"DET-003 VIOLATION: Demo email blocked: {email} in {env}")
        raise AuthenticationError("Demo credentials cannot be used in production.")
```

### 3.4 Rule DET-004: Demo Clinic ID Usage in Production

| Component | Specification |
|-----------|--------------|
| **Name** | Demo Clinic ID in Production Database |
| **Severity** | CRITICAL |
| **Trigger** | Any database operation references a clinic ID in the known demo clinic ID range or with a `is_demo=true` flag |
| **Detection** | Database trigger on `clinics`, `patients`, `courses`, `queues` tables checks `clinic_id` against the demo clinic allowlist |
| **Alert** | `CRITICAL` alert + automatic rollback of the transaction |
| **Auto-Action** | Transaction is aborted, incident is logged |

**Implementation:**
```sql
-- migration: add demo detection trigger
CREATE OR REPLACE FUNCTION prevent_demo_clinic_in_production()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.environment', true) = 'production' THEN
        IF EXISTS (
            SELECT 1 FROM clinics 
            WHERE id = NEW.clinic_id AND is_demo = true
        ) THEN
            RAISE EXCEPTION 'DET-004 VIOLATION: Attempted to use demo clinic % in production', NEW.clinic_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables referencing clinic_id
CREATE TRIGGER trg_prevent_demo_clinic_patients
    BEFORE INSERT OR UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION prevent_demo_clinic_in_production();

CREATE TRIGGER trg_prevent_demo_clinic_courses
    BEFORE INSERT OR UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION prevent_demo_clinic_in_production();

CREATE TRIGGER trg_prevent_demo_clinic_queues
    BEFORE INSERT OR UPDATE ON queues
    FOR EACH ROW EXECUTE FUNCTION prevent_demo_clinic_in_production();
```

### 3.5 Rule DET-005: Synthetic Patient Data in Real Endpoints

| Component | Specification |
|-----------|--------------|
| **Name** | Synthetic Patient Data Leakage |
| **Severity** | CRITICAL |
| **Trigger** | A non-demo endpoint returns patient data where `patient.is_synthetic=true` or `patient.data_source='synthetic'` |
| **Detection** | API response middleware cross-references all patient IDs in responses against the `patients` table |
| **Alert** | `CRITICAL` alert + immediate response suppression |
| **Auto-Action** | Response is replaced with error: "Data integrity violation detected." |

**Synthetic patient identifiers:**
- `mrn` (Medical Record Number) starting with `SYNTH-`, `DEMO-`, `MOCK-`
- `data_source` field equal to `synthetic`, `demo`, `generated`, `mock`
- `is_synthetic` boolean flag set to `true`
- First name in `['John', 'Jane', 'Test', 'Demo', 'Synthetic']` with last name `['Doe', 'Smith', 'Patient', 'User']`
- Date of birth equal to `1970-01-01` or `2000-01-01` (common defaults)

### 3.6 Rule DET-006: Demo Mode in HTTP Headers

| Component | Specification |
|-----------|--------------|
| **Name** | Unauthorized Demo Mode Request |
| **Severity** | HIGH |
| **Trigger** | An incoming request carries `X-Request-Demo-Mode: true` header or `?demo=1` query parameter to a non-demo endpoint in production |
| **Detection** | Request middleware inspects all incoming requests for demo mode indicators |
| **Alert** | `HIGH` alert + request is logged with full metadata |
| **Auto-Action** | Request is rejected with `403 Forbidden` |

### 3.7 Rule DET-007: Environment Variable Tampering

| Component | Specification |
|-----------|--------------|
| **Name** | Demo Environment Variable in Production |
| **Severity** | CRITICAL |
| **Trigger** | At startup, any environment variable with `DEMO`, `MOCK`, `SYNTHETIC`, `SEED` in its name is set to an enabled value (`1`, `true`, `yes`) in a production environment |
| **Detection** | Startup health check scans all environment variables |
| **Alert** | `CRITICAL` alert + application startup is blocked |
| **Auto-Action** | Application refuses to start |

**Flagged environment variables:**
```python
DEMO_ENV_VARS = [
    "MRI_DEMO_MODE",
    "DEEPSYNAPS_DEMO_CLINIC_SEED",
    "DEEPSYNAPS_DEMO_MODE",
    "VOICE_DEMO_MODE",
    "QEEG_DEMO_MODE",
    "ENABLE_DEMO_SEED",
    "MOCK_SERVICES",
    "SYNTHETIC_DATA",
    "FAKE_PATIENTS",
    "DEMO_USERS",
]
```

### 3.8 Rule DET-008: Cross-Schema Data References

| Component | Specification |
|-----------|--------------|
| **Name** | Cross-Schema Demo/Production Join |
| **Severity** | CRITICAL |
| **Trigger** | A SQL query joins a production table with a demo/schema table |
| **Detection** | Query analyzer detects JOINs across schema boundaries |
| **Alert** | `CRITICAL` alert |
| **Auto-Action** | Query is blocked |

---

## 4. ENFORCEMENT RULES

### 4.1 Code-Level Enforcement

#### ENF-C-001: Decorator Pattern for Demo Endpoints

All functions that may return demo data MUST be decorated with `@demo_endpoint`:

```python
# enforcement/decorators.py
from functools import wraps
import os
from typing import Callable

PRODUCTION_ENVS = {"production", "prod", "live"}

def demo_endpoint(func: Callable) -> Callable:
    """
    Decorator marking a function as a demo endpoint.
    Enforces:
    1. Cannot be called in production unless explicitly approved
    2. Response will include demo headers
    3. Access is logged
    4. Stack trace is captured for audit
    """
    func._is_demo_endpoint = True
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        env = os.environ.get("APP_ENV", "unknown").lower()
        
        # Rule: Demo endpoints cannot execute in production
        if env in PRODUCTION_ENVS:
            logger.critical(
                f"ENF-C-001 VIOLATION: Demo endpoint {func.__qualname__} "
                f"blocked in production environment: {env}"
            )
            raise PermissionError(
                f"Demo endpoint '{func.__qualname__}' is not available in production. "
                f"Environment: {env}"
            )
        
        # Log access with stack trace
        import traceback
        stack = traceback.format_stack()[:-1]  # Exclude current frame
        logger.info(
            f"Demo endpoint accessed: {func.__qualname__} | "
            f"Environment: {env} | "
            f"Caller: {stack[-1].strip() if stack else 'unknown'}"
        )
        
        # Execute and flag response
        result = func(*args, **kwargs)
        
        # Attach demo metadata to response if it's a dict
        if isinstance(result, dict):
            result.setdefault("_meta", {})
            result["_meta"]["demo"] = True
            result["_meta"]["data_source"] = "synthetic"
            result["_meta"]["clinical_validity"] = "none"
            result["_meta"]["endpoint_type"] = "demo"
        
        return result
    
    return wrapper

def is_demo_endpoint(func: Callable) -> bool:
    """Check if a function is marked as a demo endpoint."""
    return getattr(func, '_is_demo_endpoint', False)
```

#### ENF-C-002: Production-Safe Assertion

All demo code paths MUST be wrapped with `assert_not_production()`:

```python
# enforcement/safety.py
class ProductionSafetyError(Exception):
    """Raised when demo code is executed in production."""
    pass

def assert_not_production(operation_name: str) -> None:
    """
    Assert that the current environment is NOT production.
    Must be called at the entry point of EVERY demo code path.
    """
    env = os.environ.get("APP_ENV", "unknown").lower()
    
    if env in PRODUCTION_ENVS:
        logger.critical(
            f"ENF-C-002 VIOLATION: Demo operation '{operation_name}' "
            f"attempted in production environment '{env}'. "
            f"Stack trace will be captured for incident response."
        )
        raise ProductionSafetyError(
            f"Operation '{operation_name}' is forbidden in production environment '{env}'. "
            f"This is a demo-only operation. If you need this functionality in production, "
            f"it must be implemented as a production-grade feature, not demo code."
        )
    
    # Even in non-production, log the access
    logger.debug(f"Demo operation '{operation_name}' executing in environment '{env}'")
```

#### ENF-C-003: Demo Path Router Guard

The API router MUST reject demo path access in production:

```python
# enforcement/router_guard.py
from fastapi import Request, HTTPException

DEMO_PATH_PREFIXES = ["/demo/", "/mock/", "/synthetic/", "/test-data/"]

async def demo_router_guard(request: Request, call_next):
    """
    ASGI middleware: Blocks demo paths in production.
    Applied globally to all requests.
    """
    env = os.environ.get("APP_ENV", "unknown").lower()
    path = request.url.path.lower()
    
    if env in PRODUCTION_ENVS:
        for prefix in DEMO_PATH_PREFIXES:
            if path.startswith(prefix):
                logger.critical(
                    f"ENF-C-003 VIOLATION: Demo path '{path}' "
                    f"accessed in production from {request.client.host}"
                )
                raise HTTPException(
                    status_code=403,
                    detail="Demo endpoints are not available in production."
                )
    
    response = await call_next(request)
    return response
```

### 4.2 Database-Level Enforcement

#### ENF-D-001: Row-Level Security Policy

```sql
-- Enable RLS on all clinical tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mri_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE qeeg_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE adverse_events ENABLE ROW LEVEL SECURITY;

-- Create policy: production users cannot see demo data
CREATE POLICY no_demo_data_in_production ON patients
    FOR ALL
    USING (
        CASE 
            WHEN current_setting('app.environment', true) = 'production' 
            THEN is_demo = false OR is_demo IS NULL
            ELSE true
        END
    );

-- Same policy for all clinical tables
CREATE POLICY no_demo_data_in_production_courses ON courses
    FOR ALL USING (
        CASE 
            WHEN current_setting('app.environment', true) = 'production' 
            THEN is_demo = false OR is_demo IS NULL
            ELSE true
        END
    );
```

#### ENF-D-002: Schema Separation

```sql
-- Demo data lives in a separate schema
CREATE SCHEMA IF NOT EXISTS demo_data;

-- Demo tables are created ONLY in demo schema
-- e.g., demo_data.patients, demo_data.clinics, demo_data.courses

-- Production user has NO access to demo schema
REVOKE ALL ON SCHEMA demo_data FROM production_app_user;

-- Demo user has NO access to production schema
REVOKE ALL ON SCHEMA public FROM demo_app_user;
```

#### ENF-D-003: Column-Level Constraints

```sql
-- Add is_demo flag to all clinical tables
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mri_analyses ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE qeeg_analyses ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Prevent mixing: a row cannot be both real and demo
ALTER TABLE patients ADD CONSTRAINT chk_not_demo_in_production 
    CHECK (
        current_setting('app.environment', true) != 'production' 
        OR is_demo = false
    );
```

### 4.3 API Middleware Enforcement

#### ENF-A-001: Response Header Injection

```python
# enforcement/response_middleware.py
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class DemoModeHeaderMiddleware(BaseHTTPMiddleware):
    """
    Injects demo-mode headers into all responses.
    Detects demo data in response bodies and ensures proper flagging.
    """
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Check if the response contains demo indicators
        is_demo_response = self._detect_demo_in_response(response)
        
        if is_demo_response:
            response.headers["X-Demo-Mode"] = "true"
            response.headers["X-Clinical-Grade"] = "synthetic"
            response.headers["X-Data-Source"] = "demo"
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            
            # Log demo response
            logger.info(
                f"Demo response served: {request.method} {request.url.path} | "
                f"Client: {request.client.host if request.client else 'unknown'}"
            )
        else:
            # Explicitly mark as NOT demo
            response.headers["X-Demo-Mode"] = "false"
            response.headers["X-Clinical-Grade"] = "clinical"
        
        return response
    
    def _detect_demo_in_response(self, response: Response) -> bool:
        """Scan response body for demo indicators."""
        # Check if response already flagged as demo
        if response.headers.get("X-Demo-Mode") == "true":
            return True
        
        # Scan body for demo indicators
        body = getattr(response, 'body', b'')
        if body:
            body_str = body.decode('utf-8', errors='ignore').lower()
            demo_markers = [
                '"demo": true',
                '"data_source": "synthetic"',
                '"clinical_validity": "none"',
                '"patient_type": "synthetic"',
                '"endpoint_type": "demo"',
            ]
            return any(marker in body_str for marker in demo_markers)
        
        return False
```

#### ENF-A-002: Request Source Validation

```python
# enforcement/request_validator.py
from fastapi import Request, HTTPException
import ipaddress

# IP ranges that are never allowed to access demo endpoints in production
BLOCKED_RANGES = [
    ipaddress.ip_network("0.0.0.0/8"),       # Current network
    ipaddress.ip_network("10.0.0.0/8"),      # Private (if exposed)
    ipaddress.ip_network("127.0.0.0/8"),     # Loopback
]

async def validate_request_source(request: Request):
    """Validate that the request source is legitimate."""
    client_ip = ipaddress.ip_address(request.client.host)
    env = os.environ.get("APP_ENV", "unknown").lower()
    
    # In production, demo endpoints are completely disabled
    if env in PRODUCTION_ENVS and request.url.path.startswith("/demo/"):
        logger.critical(
            f"ENF-A-002 VIOLATION: Demo endpoint access attempted in production "
            f"from {client_ip} to {request.url.path}"
        )
        raise HTTPException(status_code=403, detail="Demo endpoints disabled in production")
```

### 4.4 Deployment Gate Enforcement

#### ENF-Deploy-001: Pre-Deployment Demo Scan

```yaml
# .github/workflows/demo-scan.yml
name: Demo/Production Boundary Scan

on:
  pull_request:
    branches: [main, production]
  push:
    branches: [main, production]

jobs:
  demo-scan:
    name: Scan for Demo Configuration Leaks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Scan fly.toml for demo flags
        run: |
          # Fail if any demo mode is enabled in production config
          if grep -iE '(DEMO_MODE.*=.*"?1"?|DEMO_MODE.*=.*true)' fly.toml; then
            echo "ERROR: Demo mode enabled in production fly.toml"
            exit 1
          fi
          
      - name: Scan for hardcoded demo endpoints
        run: |
          if grep -r "@demo_endpoint" --include="*.py" .; then
            echo "INFO: Found demo endpoints (OK if properly gated)"
          fi
          
      - name: Run demo boundary verification
        run: python scripts/verify_demo_boundary.py
```

#### ENF-Deploy-002: Helm/ConfigMap Validation

```yaml
# kubernetes/validate-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: production-config-validator
data:
  validate.sh: |
    #!/bin/bash
    set -e
    
    # Check no demo env vars are set
    for var in MRI_DEMO_MODE DEEPSYNAPS_DEMO_CLINIC_SEED DEEPSYNAPS_DEMO_MODE; do
      if [ "${!var}" = "1" ] || [ "${!var}" = "true" ]; then
        echo "FATAL: Demo variable $var is enabled in production"
        exit 1
      fi
    done
    
    echo "Config validation passed: No demo mode enabled"
```

### 4.5 Runtime Monitoring Enforcement

#### ENF-R-001: Periodic Environment Scan

```python
# enforcement/runtime_monitor.py
import asyncio
import os
from datetime import datetime

async def runtime_environment_monitor():
    """
    Background task that periodically scans for demo mode activation.
    Runs every 60 seconds in production.
    """
    while True:
        await asyncio.sleep(60)
        
        env = os.environ.get("APP_ENV", "unknown").lower()
        if env not in PRODUCTION_ENVS:
            continue
        
        # Scan for any demo-related env var changes
        for key, value in os.environ.items():
            key_upper = key.upper()
            if any(kw in key_upper for kw in ["DEMO", "MOCK", "SYNTHETIC", "SEED", "FAKE"]):
                if value.lower() in ("1", "true", "yes", "enabled"):
                    logger.critical(
                        f"ENF-R-001 VIOLATION: Demo environment variable detected "
                        f"at runtime: {key}={value} in production. "
                        f"Timestamp: {datetime.utcnow().isoformat()}"
                    )
                    # Alert via webhook
                    await alert_security_team(
                        f"Runtime demo variable detected: {key}={value}"
                    )
```

---

## 5. REMEDIATION PLAN

### 5.1 Immediate Actions (P0 — Within 24 Hours)

| ID | Action | Owner | Verification |
|----|--------|-------|-------------|
| R-001 | Change `MRI_DEMO_MODE = "1"` to `MRI_DEMO_MODE = "0"` in production `fly.toml` | DevOps | `grep -q 'MRI_DEMO_MODE = "0"' fly.toml` |
| R-002 | Deploy hotfix with corrected config | DevOps | Verify in running container env |
| R-003 | Audit all MRI analyses from last 30 days to identify any demo data served | Security | Database query for `is_demo=true` in `mri_analyses` |
| R-004 | Notify all clinical users if any demo MRI data may have been served | Clinical Ops | Communication log |

### 5.2 Short-Term Actions (P1 — Within 1 Week)

| ID | Action | Owner | Verification |
|----|--------|-------|-------------|
| R-005 | Implement `demo_seed_enabled()` fix removing env-var backdoor | Backend Eng | Unit test passes |
| R-006 | Add `@demo_endpoint` decorator to all demo functions | Backend Eng | Code review |
| R-007 | Implement `assert_not_production()` at all demo entry points | Backend Eng | Static analysis |
| R-008 | Add `DemoModeHeaderMiddleware` to API stack | Backend Eng | Integration test |
| R-009 | Add `demo_router_guard` middleware | Backend Eng | HTTP 403 test on `/demo/` |
| R-010 | Create `demo_data` schema and migrate demo tables | DBA | Schema diff review |
| R-011 | Add `is_demo` column to all clinical tables | DBA | Migration verification |
| R-012 | Implement row-level security policies | DBA | Policy test |

### 5.3 Medium-Term Actions (P2 — Within 1 Month)

| ID | Action | Owner | Verification |
|----|--------|-------|-------------|
| R-013 | Implement all detection rules (DET-001 through DET-008) | Security Eng | Detection test suite |
| R-014 | Deploy runtime environment monitor | DevOps | Alert reception test |
| R-015 | Implement CI/CD demo scan gates | DevOps | Failed pipeline test |
| R-016 | Create `demo_activation_log` table and approval workflow | Backend Eng | Workflow test |
| R-017 | Build demo audit dashboard | Frontend Eng | Visual verification |
| R-018 | Add cross-schema join detection | DBA | Query interception test |
| R-019 | Deploy `verify_demo_boundary.py` as CI gate | DevOps | Pipeline test |

### 5.4 Verification Checklist

```
[ ] Production fly.toml has MRI_DEMO_MODE = "0"
[ ] demo_seed_enabled() uses strict environment allowlist
[ ] All demo functions have @demo_endpoint decorator
[ ] assert_not_production() guards all demo entry points
[ ] Demo paths return 403 in production
[ ] X-Demo-Mode header is present on all demo responses
[ ] X-Demo-Mode: false on all production responses
[ ] is_demo column exists on all clinical tables
[ ] Row-level security policies are active
[ ] Demo schema is separate from production schema
[ ] Detection rules are deployed and alerting
[ ] Runtime monitor is running
[ ] CI/CD gates block demo config
[ ] Audit log captures all demo access
[ ] verify_demo_boundary.py passes in CI
[ ] verify_demo_boundary.py passes in production
```

---

## 6. BOUNDARY RULES BY FEATURE

### 6.1 MRI Analysis Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| MRI-001 | MRI analysis MUST NOT fall back to demo mode in production | Code: `assert_not_production()` before any fallback |
| MRI-002 | MRI demo fallback MUST be explicit and loudly logged | Log at CRITICAL, return 500 error, alert on-call |
| MRI-003 | MRI demo analysis results MUST carry `is_demo=true` in database | Database constraint on `mri_analyses.is_demo` |
| MRI-004 | MRI endpoint MUST check `MRI_DEMO_MODE` at request time, not just startup | Middleware validates env var on every request |
| MRI-005 | MRI processing failure MUST NOT silently return synthetic data | Error response only; demo data requires explicit opt-in |
| MRI-006 | MRI demo data MUST use clearly synthetic identifiers (e.g., `MRIDEMO-*`) | Naming convention enforced at creation time |

```python
# enforcement/mri_boundary.py
class MRIBoundaryEnforcer:
    """Enforces demo/production boundary for MRI analysis."""
    
    DEMO_ID_PREFIX = "MRIDEMO-"
    PRODUCTION_ENVS = {"production", "prod", "live"}
    
    @classmethod
    def validate_mri_request(cls, env: str) -> None:
        """Validate MRI analysis request environment."""
        if env in cls.PRODUCTION_ENVS:
            demo_mode = os.environ.get("MRI_DEMO_MODE", "0")
            if demo_mode in ("1", "true", "yes"):
                logger.critical(
                    "MRI-001 VIOLATION: MRI demo mode is enabled in production. "
                    "All MRI requests will be blocked until this is resolved."
                )
                raise ProductionSafetyError(
                    "MRI demo mode is enabled in production environment. "
                    "This is a critical security violation. "
                    "Set MRI_DEMO_MODE=0 to restore service."
                )
    
    @classmethod
    def flag_demo_analysis(cls, analysis_data: dict) -> dict:
        """Flag MRI analysis data as demo."""
        analysis_data["is_demo"] = True
        analysis_data["_meta"] = {
            "demo": True,
            "data_source": "synthetic",
            "clinical_validity": "none",
            "feature": "mri_analysis"
        }
        return analysis_data
    
    @classmethod
    def is_demo_mri_id(cls, mri_id: str) -> bool:
        """Check if an MRI ID is a demo identifier."""
        return mri_id.startswith(cls.DEMO_ID_PREFIX)
```

### 6.2 qEEG Analysis Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| QEEG-001 | qEEG analysis MUST NOT use demo data paths in production | Path validation before file access |
| QEEG-002 | qEEG demo data MUST be stored in `demo_data/qeeg/` directory only | Filesystem permission restriction |
| QEEG-003 | qEEG analysis results MUST carry `is_demo` flag | Database constraint |
| QEEG-004 | qEEG processing MUST validate input data source | Input validation rejects synthetic data in production |

### 6.3 Voice Engine Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| VOICE-001 | Whisper warm-up MUST NOT use real patient audio | Warm-up uses synthetic audio files only |
| VOICE-002 | Rule-based voice fallback MUST be clearly marked | Response includes `X-Voice-Fallback: rule-based` header |
| VOICE-003 | Voice demo mode MUST NOT transcribe production audio | Audio source validation before processing |
| VOICE-004 | Voice engine demo output MUST NOT be stored in clinical notes | Storage layer rejects demo-flagged transcriptions |

```python
# enforcement/voice_boundary.py
class VoiceBoundaryEnforcer:
    """Enforces demo/production boundary for voice engine."""
    
    @staticmethod
    def validate_audio_source(audio_metadata: dict, env: str) -> None:
        """Validate that audio source is clinical-grade in production."""
        if env in PRODUCTION_ENVS:
            source = audio_metadata.get("source", "unknown")
            if source in ("demo", "synthetic", "mock", "test"):
                logger.critical(
                    f"VOICE-003 VIOLATION: Demo audio source '{source}' "
                    f"submitted for transcription in production"
                )
                raise ProductionSafetyError(
                    f"Audio source '{source}' is not clinical-grade. "
                    f"Cannot process in production environment."
                )
```

### 6.4 Medication Analysis Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| MED-001 | Medication analysis MUST use FDA FAERS data for adverse events | Data source validation |
| MED-002 | Demo medication interactions MUST NOT be returned as clinical guidance | Response validation blocks demo data |
| MED-003 | FAERS data MUST be labeled as research-only | All FAERS responses carry research disclaimer |
| MED-004 | Synthetic drug interaction data MUST NOT mix with FAERS data | Separate storage, no cross-referencing |

### 6.5 Patient Data Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| PT-001 | Demo patient records MUST use `is_demo=true` | Database default + constraint |
| PT-002 | Demo patients MUST have MRN in `SYNTH-*` or `DEMO-*` format | Format validation at creation |
| PT-003 | Demo patient data MUST NOT appear in production reports | Report generation filters `is_demo=true` |
| PT-004 | Patient search MUST exclude demo patients in production | Query filter on all search endpoints |
| PT-005 | Demo patient data MUST NOT be included in analytics/ML training | ETL pipeline excludes demo records |

### 6.6 Payment Processing Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| PAY-001 | Payment processing MUST NEVER use demo/synthetic data | Zero tolerance — hard block |
| PAY-002 | Demo payment methods MUST NOT be accepted | Card number prefix validation |
| PAY-003 | Payment in demo mode MUST use test payment processor | Separate payment gateway configuration |
| PAY-004 | Any payment attempt with demo patient MUST be rejected | Pre-transaction validation |

```python
# enforcement/payment_boundary.py
class PaymentBoundaryEnforcer:
    """Payment processing has zero tolerance for demo data."""
    
    TEST_CARD_PREFIXES = {"4242", "4000", "4111"}  # Stripe test cards
    
    @classmethod
    def validate_payment_request(cls, patient_id: str, card_number: str, env: str) -> None:
        """Validate that payment request is production-safe."""
        if env in PRODUCTION_ENVS:
            # Block demo patients from payment
            if patient_id.startswith(("SYNTH-", "DEMO-", "MOCK-")):
                logger.critical(
                    f"PAY-004 VIOLATION: Payment attempted for demo patient {patient_id} "
                    f"in production"
                )
                raise ProductionSafetyError("Demo patients cannot make payments in production")
            
            # Block test cards in production
            card_prefix = card_number[:4] if card_number else ""
            if card_prefix in cls.TEST_CARD_PREFIXES:
                logger.critical(
                    f"PAY-002 VIOLATION: Test card {card_prefix}**** used in production"
                )
                raise ProductionSafetyError("Test payment cards cannot be used in production")
```

### 6.7 Wearable Integration Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| WEAR-001 | Wearable demo mode MUST only generate data for demo patients | Patient ID validation |
| WEAR-002 | Unsupported device demo data MUST NOT be stored as real measurements | Data ingestion validates source |
| WEAR-003 | Wearable demo data MUST carry `source: "wearable_demo"` | Metadata tagging at generation |
| WEAR-004 | Wearable integrations in demo mode MUST NOT write to production data stores | Separate database schema |

### 6.8 Evidence Pipeline Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| EVD-001 | Evidence pipeline demo data MUST be clearly labeled | `is_demo=true` on all evidence records |
| EVD-002 | Demo evidence MUST NOT be included in clinical decision support | CDS query filters demo records |
| EVD-003 | Evidence pipeline MUST validate data source before ingestion | Source validation middleware |
| EVD-004 | Synthetic evidence MUST use `EVIDENCE-DEMO-*` identifiers | Naming convention enforcement |

### 6.9 Adverse Events (FAERS) Boundary

| Rule | Description | Enforcement |
|------|-------------|-------------|
| FAERS-001 | FAERS data is ALWAYS research-only, never clinical-grade | Immutable flag on all FAERS records |
| FAERS-002 | FAERS data MUST carry research disclaimer in all responses | Response middleware adds disclaimer |
| FAERS-003 | FAERS demo/synthetic data MUST NOT be created | FAERS data is read-only from official source |
| FAERS-004 | Any FAERS-based recommendation MUST include confidence level | Response includes `confidence: <score>` |

---

## 7. AUDIT TRAIL REQUIREMENTS

### 7.1 Audit Log Schema

```sql
-- demo_audit_log table
CREATE TABLE demo_audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    environment VARCHAR(30) NOT NULL,
    
    -- Who
    user_id BIGINT REFERENCES users(id),
    user_email VARCHAR(255),
    client_ip INET,
    
    -- What
    endpoint_path TEXT,
    http_method VARCHAR(10),
    feature VARCHAR(50),  -- 'mri', 'qeeg', 'voice', 'medication', etc.
    demo_data_id VARCHAR(255),
    
    -- Context
    request_headers JSONB,
    stack_trace TEXT,
    additional_context JSONB,
    
    -- Response
    action_taken VARCHAR(100),  -- 'blocked', 'allowed', 'flagged', 'alerted'
    response_status_code INTEGER,
    
    -- Indexing
    CONSTRAINT chk_event_type CHECK (event_type IN (
        'demo_access', 'demo_blocked', 'demo_config_violation',
        'demo_data_leakage', 'demo_mode_activated', 'demo_seed_executed',
        'demo_endpoint_accessed', 'demo_variable_detected'
    ))
);

-- Indexes for fast querying
CREATE INDEX idx_demo_audit_timestamp ON demo_audit_log(timestamp DESC);
CREATE INDEX idx_demo_audit_event_type ON demo_audit_log(event_type);
CREATE INDEX idx_demo_audit_severity ON demo_audit_log(severity);
CREATE INDEX idx_demo_audit_environment ON demo_audit_log(environment);
CREATE INDEX idx_demo_audit_feature ON demo_audit_log(feature);
```

### 7.2 Required Audit Events

| Event Type | When Logged | Severity | Required Fields |
|------------|-------------|----------|----------------|
| `demo_access` | Every time demo data is accessed | INFO | user_id, endpoint_path, feature |
| `demo_blocked` | Demo access blocked in production | CRITICAL | user_id, endpoint_path, stack_trace, client_ip |
| `demo_config_violation` | Demo config found in production | CRITICAL | env_var_name, env_var_value, stack_trace |
| `demo_data_leakage` | Demo data detected in production response | CRITICAL | endpoint_path, demo_data_id, response_preview |
| `demo_mode_activated` | Demo mode is turned on | WARNING | activated_by, reason, environment |
| `demo_seed_executed` | Demo seed function runs | INFO | seed_function, records_created, environment |
| `demo_endpoint_accessed` | Demo endpoint receives request | INFO | endpoint_path, user_id, response_size |
| `demo_variable_detected` | Demo env var detected at runtime | CRITICAL | var_name, var_value, process_id |

### 7.3 Audit Logging Implementation

```python
# audit/logger.py
from datetime import datetime
from typing import Optional, Dict, Any
import json

class DemoAuditLogger:
    """
    Centralized audit logger for all demo-related events.
    Every demo boundary crossing MUST be logged through this class.
    """
    
    @classmethod
    async def log_event(
        cls,
        event_type: str,
        severity: str,
        environment: str,
        user_id: Optional[int] = None,
        user_email: Optional[str] = None,
        client_ip: Optional[str] = None,
        endpoint_path: Optional[str] = None,
        http_method: Optional[str] = None,
        feature: Optional[str] = None,
        demo_data_id: Optional[str] = None,
        stack_trace: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None,
        action_taken: Optional[str] = None,
        response_status_code: Optional[int] = None,
    ) -> None:
        """Log a demo audit event to the database and application logs."""
        
        event = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "event_type": event_type,
            "severity": severity,
            "environment": environment,
            "user_id": user_id,
            "user_email": user_email,
            "client_ip": client_ip,
            "endpoint_path": endpoint_path,
            "http_method": http_method,
            "feature": feature,
            "demo_data_id": demo_data_id,
            "stack_trace": stack_trace,
            "additional_context": json.dumps(additional_context) if additional_context else None,
            "action_taken": action_taken,
            "response_status_code": response_status_code,
        }
        
        # Log to application logger (always)
        log_message = (
            f"DEMO_AUDIT: event_type={event_type} severity={severity} "
            f"environment={environment} endpoint={endpoint_path} "
            f"feature={feature} action={action_taken}"
        )
        
        if severity == "CRITICAL":
            logger.critical(log_message)
        elif severity == "WARNING":
            logger.warning(log_message)
        else:
            logger.info(log_message)
        
        # Write to database audit log
        await cls._write_to_db(event)
        
        # For CRITICAL events, also send alert
        if severity == "CRITICAL":
            await cls._send_alert(event)
    
    @classmethod
    async def _write_to_db(cls, event: Dict[str, Any]) -> None:
        """Persist audit event to database."""
        # Implementation depends on your ORM
        # async with get_db_session() as session:
        #     log_entry = DemoAuditLog(**event)
        #     session.add(log_entry)
        #     await session.commit()
        pass
    
    @classmethod
    async def _send_alert(cls, event: Dict[str, Any]) -> None:
        """Send CRITICAL alert to security team."""
        # Implementation: PagerDuty, Slack, email
        alert_message = (
            f"🚨 DEMO BOUNDARY VIOLATION\n"
            f"Event: {event['event_type']}\n"
            f"Environment: {event['environment']}\n"
            f"Endpoint: {event.get('endpoint_path', 'N/A')}\n"
            f"Feature: {event.get('feature', 'N/A')}\n"
            f"Action Taken: {event.get('action_taken', 'N/A')}\n"
            f"Timestamp: {event['timestamp']}"
        )
        logger.critical(alert_message)
```

### 7.4 Monthly Audit Review Process

```markdown
## Monthly Demo Audit Review Checklist

### Review Date: ___________ Reviewer: ___________

- [ ] Query `demo_audit_log` for all CRITICAL events in the past month
- [ ] Review all `demo_blocked` events — investigate any patterns
- [ ] Check for `demo_config_violation` events — confirm all were resolved
- [ ] Verify no `demo_data_leakage` events occurred
- [ ] Confirm all `demo_mode_activated` events were properly authorized
- [ ] Review demo seed execution logs — confirm only in allowed environments
- [ ] Check that `demo_endpoint_accessed` events only occurred in dev/staging
- [ ] Verify no `demo_variable_detected` events in production
- [ ] Run `verify_demo_boundary.py` and confirm exit code 0
- [ ] Review demo schema access logs — confirm no production user access
- [ ] Check `is_demo` column counts on all clinical tables — should be 0 in production
- [ ] Confirm MRI_DEMO_MODE=0 in production deployment config
- [ ] Review CI/CD pipeline logs for demo scan gate passes
- [ ] Update this document with any new findings

### Findings:
<!-- Record any issues found -->

### Actions Taken:
<!-- Record remediation actions -->

### Sign-off:
Reviewer: ___________ Date: ___________
Security Lead: ___________ Date: ___________
```

---

## 8. VERIFICATION SCRIPT

The following Python script serves as both a **CI gate** and a **production monitor**. It checks for demo data leakage and returns exit code 0 (safe) or 1 (leakage detected).

```python
#!/usr/bin/env python3
"""
verify_demo_boundary.py — Demo/Production Boundary Verification

Checks for demo data leakage into production environments.
Usage:
    python verify_demo_boundary.py [--env <environment>] [--strict]

Exit codes:
    0 — No demo leakage detected (SAFE)
    1 — Demo leakage or configuration violation detected (UNSAFE)
    2 — Script error (could not complete verification)

This script MUST pass in CI before any deployment to production.
This script SHOULD run periodically in production as a health check.
"""

import argparse
import ast
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set


# ============================================================================
# CONFIGURATION
# ============================================================================

PRODUCTION_ENVS = {"production", "prod", "live"}

# Environment variables that should NEVER be enabled in production
DEMO_ENV_VARS = [
    "MRI_DEMO_MODE",
    "DEEPSYNAPS_DEMO_CLINIC_SEED",
    "DEEPSYNAPS_DEMO_MODE",
    "VOICE_DEMO_MODE",
    "QEEG_DEMO_MODE",
    "ENABLE_DEMO_SEED",
    "MOCK_SERVICES",
    "SYNTHETIC_DATA",
    "FAKE_PATIENTS",
    "DEMO_USERS",
    "WEARABLE_DEMO_MODE",
    "EVIDENCE_DEMO_MODE",
]

# File patterns that may contain demo-related code
SCAN_FILE_PATTERNS = [
    "*.py",
    "*.toml",
    "*.yaml",
    "*.yml",
    "*.env*",
    "*.json",
    "Dockerfile*",
]

# Directories to exclude from scanning
EXCLUDE_DIRS = {
    ".git", "__pycache__", ".pytest_cache", "node_modules",
    ".venv", "venv", "env", "dist", "build", ".tox",
}

# Demo indicators in code
DEMO_CODE_PATTERNS = [
    re.compile(r'demo_seed_enabled\s*\([^)]*\)'),  # Demo seed function calls
    re.compile(r'MRI_DEMO_MODE\s*=\s*["\']?1["\']?'),  # MRI demo enabled
    re.compile(r'demo.*mode.*=.*true', re.IGNORECASE),  # Demo mode true
    re.compile(r'@demo_endpoint'),  # Decorator usage
    re.compile(r'example\.com'),  # Example domain usage
    re.compile(r'clinician@example\.com|admin@example\.com'),  # Demo emails
    re.compile(r'seed_demo_'),  # Demo seed functions
    re.compile(r'\.is_demo\s*=\s*True'),  # Demo flag assignment
    re.compile(r'DEEPSYNAPS_DEMO_CLINIC_SEED\s*=\s*["\']?1["\']?'),  # Env var
]

# Demo table names that should not be queried in production
DEMO_TABLE_PATTERNS = [
    re.compile(r'\bdemo_\w+'),
    re.compile(r'\b\w+_demo\b'),
    re.compile(r'\bseed_data\b'),
    re.compile(r'\bsynthetic_\w+'),
    re.compile(r'\bmock_\w+'),
]

# Demo path prefixes that should be blocked in production
DEMO_PATH_PREFIXES = ["/demo/", "/mock/", "/synthetic/", "/test-data/"]

# Demo MRN/patient ID prefixes
DEMO_ID_PREFIXES = ["SYNTH-", "DEMO-", "MOCK-", "TEST-", "MRIDEMO-", "EVIDENCE-DEMO-"]


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class Violation:
    """Represents a single boundary violation."""
    rule_id: str
    severity: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    message: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    line_content: Optional[str] = None
    remediation: Optional[str] = None


@dataclass
class VerificationResult:
    """Aggregated result of all verification checks."""
    violations: List[Violation] = field(default_factory=list)
    checks_passed: int = 0
    checks_failed: int = 0
    checks_skipped: int = 0

    def add_violation(self, violation: Violation) -> None:
        self.violations.append(violation)
        self.checks_failed += 1

    def add_pass(self) -> None:
        self.checks_passed += 1

    def add_skip(self) -> None:
        self.checks_skipped += 1

    @property
    def has_critical(self) -> bool:
        return any(v.severity == "CRITICAL" for v in self.violations)

    @property
    def has_violations(self) -> bool:
        return len(self.violations) > 0

    def summary(self) -> str:
        lines = [
            "=" * 70,
            "DEMO/PRODUCTION BOUNDARY VERIFICATION SUMMARY",
            "=" * 70,
            f"  Checks passed:  {self.checks_passed}",
            f"  Checks failed:  {self.checks_failed}",
            f"  Checks skipped: {self.checks_skipped}",
            f"  Total violations: {len(self.violations)}",
            f"  Critical violations: {sum(1 for v in self.violations if v.severity == 'CRITICAL')}",
            "-" * 70,
        ]

        if self.violations:
            lines.append("VIOLATIONS:")
            for i, v in enumerate(self.violations, 1):
                location = f"{v.file_path}:{v.line_number}" if v.file_path and v.line_number else v.file_path or "N/A"
                lines.append(f"\n  [{i}] {v.severity} — {v.rule_id}")
                lines.append(f"      Message: {v.message}")
                lines.append(f"      Location: {location}")
                if v.line_content:
                    lines.append(f"      Code: {v.line_content.strip()}")
                if v.remediation:
                    lines.append(f"      Fix: {v.remediation}")
        else:
            lines.append("✓ NO VIOLATIONS DETECTED — Boundary is secure.")

        lines.append("=" * 70)
        return "\n".join(lines)


# ============================================================================
# VERIFICATION CHECKS
# ============================================================================

def check_001_env_vars(result: VerificationResult, env: str) -> None:
    """
    Check 001: Verify no demo environment variables are enabled.
    Rule: DET-007, ENF-C-002
    """
    check_name = "CHECK-001: Demo Environment Variables"

    if env not in PRODUCTION_ENVS:
        result.add_skip()
        return  # Only relevant in production

    found_violation = False
    for var_name in DEMO_ENV_VARS:
        value = os.environ.get(var_name, "").lower()
        if value in ("1", "true", "yes", "enabled"):
            result.add_violation(Violation(
                rule_id="DET-007",
                severity="CRITICAL",
                message=f"Demo environment variable {var_name}={value} detected in production",
                file_path=None,
                line_number=None,
                remediation=f"Unset {var_name} or set it to '0' in production",
            ))
            found_violation = True

    if not found_violation:
        result.add_pass()

def check_002_fly_toml(result: VerificationResult, env: str, project_root: Path) -> None:
    """
    Check 002: Scan fly.toml for demo mode configuration.
    Rule: CRIT-001
    """
    check_name = "CHECK-002: fly.toml Demo Configuration"
    fly_toml = project_root / "fly.toml"

    if not fly_toml.exists():
        result.add_skip()
        return

    found_violation = False
    with open(fly_toml, 'r') as f:
        for line_no, line in enumerate(f.readlines(), 1):
            # Check for MRI_DEMO_MODE = "1"
            if re.search(r'MRI_DEMO_MODE\s*=\s*["\']?1["\']?', line):
                result.add_violation(Violation(
                    rule_id="CRIT-001",
                    severity="CRITICAL",
                    message="MRI_DEMO_MODE is enabled (set to '1') in fly.toml",
                    file_path=str(fly_toml),
                    line_number=line_no,
                    line_content=line.strip(),
                    remediation="Change MRI_DEMO_MODE to '0' in production fly.toml",
                ))
                found_violation = True
            # Check for any DEMO_MODE = "1"
            if re.search(r'\w*DEMO\w*_MODE\s*=\s*["\']?1["\']?', line):
                result.add_violation(Violation(
                    rule_id="CRIT-001",
                    severity="CRITICAL",
                    message="A demo mode variable is enabled in fly.toml",
                    file_path=str(fly_toml),
                    line_number=line_no,
                    line_content=line.strip(),
                    remediation="Remove all demo mode flags from production fly.toml",
                ))
                found_violation = True

    if not found_violation:
        result.add_pass()

def check_003_demo_seed_backdoor(result: VerificationResult, project_root: Path) -> None:
    """
    Check 003: Scan for demo_seed_enabled backdoor pattern.
    Rule: CRIT-002
    """
    check_name = "CHECK-003: Demo Seed Backdoor Pattern"
    found_violation = False

    for py_file in project_root.rglob("*.py"):
        if any(excluded in str(py_file) for excluded in EXCLUDE_DIRS):
            continue

        try:
            with open(py_file, 'r') as f:
                content = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue

        # Check for the dangerous pattern: env in ("dev", "test") or os.environ.get(...)
        if re.search(
            r'env\s+in\s+\([^)]*\)\s+or\s+os\.environ\.get\s*\(\s*["\'][^"\']*DEMO[^"\']*["\']',
            content
        ):
            # Find the line
            for line_no, line in enumerate(content.split('\n'), 1):
                if 'or os.environ.get' in line and 'env in' in content:
                    result.add_violation(Violation(
                        rule_id="CRIT-002",
                        severity="CRITICAL",
                        message=f"Demo seed backdoor pattern detected — environment check can be bypassed via env var",
                        file_path=str(py_file),
                        line_number=line_no,
                        line_content=line.strip(),
                        remediation="Use strict environment allowlist with no env-var bypass",
                    ))
                    found_violation = True
                    break

    if not found_violation:
        result.add_pass()

def check_004_example_com_emails(result: VerificationResult, project_root: Path) -> None:
    """
    Check 004: Scan for hardcoded @example.com email addresses.
    Rule: DET-003
    """
    check_name = "CHECK-004: Example.com Email Addresses"
    found_violation = False

    for pattern in SCAN_FILE_PATTERNS:
        for file_path in project_root.rglob(pattern):
            if any(excluded in str(file_path) for excluded in EXCLUDE_DIRS):
                continue

            try:
                with open(file_path, 'r') as f:
                    content = f.read()
            except (UnicodeDecodeError, PermissionError):
                continue

            # Skip this verification script itself
            if file_path.name == "verify_demo_boundary.py":
                continue

            matches = re.finditer(r'\b[\w.-]+@example\.(com|org|net)\b', content)
            for match in matches:
                # Count lines to get line number
                line_no = content[:match.start()].count('\n') + 1
                lines = content.split('\n')
                line_content = lines[line_no - 1] if line_no <= len(lines) else ""

                result.add_violation(Violation(
                    rule_id="DET-003",
                    severity="HIGH",
                    message=f"Demo email address '{match.group()}' found in source code",
                    file_path=str(file_path),
                    line_number=line_no,
                    line_content=line_content.strip(),
                    remediation="Move demo credentials to environment-specific config files",
                ))
                found_violation = True

    if not found_violation:
        result.add_pass()

def check_005_demo_table_queries(result: VerificationResult, project_root: Path) -> None:
    """
    Check 005: Scan for direct references to demo tables in SQL strings.
    Rule: DET-001
    """
    check_name = "CHECK-005: Demo Table References in SQL"
    found_violation = False

    for py_file in project_root.rglob("*.py"):
        if any(excluded in str(py_file) for excluded in EXCLUDE_DIRS):
            continue

        try:
            with open(py_file, 'r') as f:
                content = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue

        # Find SQL strings (simplified — checks quoted strings containing SQL)
        sql_patterns = re.finditer(
            r'["\']\s*(SELECT|INSERT|UPDATE|DELETE|FROM|JOIN|INTO)\s+[^"\']*demo_\w+[^"\']*["\']',
            content,
            re.IGNORECASE
        )

        for match in sql_patterns:
            line_no = content[:match.start()].count('\n') + 1
            lines = content.split('\n')
            line_content = lines[line_no - 1] if line_no <= len(lines) else ""

            result.add_violation(Violation(
                rule_id="DET-001",
                severity="HIGH",
                message="SQL query references demo table",
                file_path=str(py_file),
                line_number=line_no,
                line_content=line_content.strip(),
                remediation="Remove hardcoded demo table references from production code",
            ))
            found_violation = True

    if not found_violation:
        result.add_pass()

def check_006_decorator_usage(result: VerificationResult, project_root: Path) -> None:
    """
    Check 006: Verify @demo_endpoint decorator is used on all demo functions.
    Rule: ENF-C-001
    """
    check_name = "CHECK-006: Demo Endpoint Decorator Usage"
    found_violation = False

    for py_file in project_root.rglob("*.py"):
        if any(excluded in str(py_file) for excluded in EXCLUDE_DIRS):
            continue

        try:
            with open(py_file, 'r') as f:
                content = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue

        # Find functions with "demo" or "seed" in name that aren't decorated
        # This is a heuristic check
        tree = ast.parse(content)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                func_name = node.name.lower()
                if any(kw in func_name for kw in ['demo', 'seed', 'mock', 'synthetic']):
                    # Check if decorated with @demo_endpoint
                    has_demo_decorator = any(
                        isinstance(d, ast.Name) and d.id == 'demo_endpoint'
                        for d in node.decorator_list
                    )
                    if not has_demo_decorator and 'test' not in func_name:
                        result.add_violation(Violation(
                            rule_id="ENF-C-001",
                            severity="MEDIUM",
                            message=f"Function '{node.name}' appears demo-related but lacks @demo_endpoint decorator",
                            file_path=str(py_file),
                            line_number=node.lineno,
                            remediation="Add @demo_endpoint decorator or rename function to clarify non-demo purpose",
                        ))
                        found_violation = True

    if not found_violation:
        result.add_pass()

def check_007_demo_path_in_routes(result: VerificationResult, project_root: Path) -> None:
    """
    Check 007: Scan for demo path definitions in API routes.
    Rule: ENF-C-003
    """
    check_name = "CHECK-007: Demo Path Route Definitions"
    found_violation = False

    for py_file in project_root.rglob("*.py"):
        if any(excluded in str(py_file) for excluded in EXCLUDE_DIRS):
            continue

        try:
            with open(py_file, 'r') as f:
                content = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue

        # Check for demo path prefixes in route definitions
        for prefix in DEMO_PATH_PREFIXES:
            pattern = re.compile(r'["\']' + re.escape(prefix) + r'[^"\']*["\']')
            for match in pattern.finditer(content):
                line_no = content[:match.start()].count('\n') + 1
                lines = content.split('\n')
                line_content = lines[line_no - 1] if line_no <= len(lines) else ""

                result.add_violation(Violation(
                    rule_id="ENF-C-003",
                    severity="MEDIUM",
                    message=f"Demo path '{prefix}' found in route definition",
                    file_path=str(py_file),
                    line_number=line_no,
                    line_content=line_content.strip(),
                    remediation="Ensure demo paths are protected by demo_router_guard middleware",
                ))
                found_violation = True

    if not found_violation:
        result.add_pass()

def check_008_production_safety_assertions(result: VerificationResult, project_root: Path) -> None:
    """
    Check 008: Verify assert_not_production() is called in demo entry points.
    Rule: ENF-C-002
    """
    check_name = "CHECK-008: Production Safety Assertions"
    found_violation = False

    for py_file in project_root.rglob("*.py"):
        if any(excluded in str(py_file) for excluded in EXCLUDE_DIRS):
            continue

        try:
            with open(py_file, 'r') as f:
                content = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue

        # Find functions that call demo seeding but don't assert_not_production
        if 'seed_demo' in content:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    func_body = ast.dump(node)
                    if 'seed_demo' in func_body:
                        if 'assert_not_production' not in func_body:
                            result.add_violation(Violation(
                                rule_id="ENF-C-002",
                                severity="MEDIUM",
                                message=f"Function '{node.name}' calls demo seeding without assert_not_production()",
                                file_path=str(py_file),
                                line_number=node.lineno,
                                remediation="Add assert_not_production('<operation_name>') at function entry",
                            ))
                            found_violation = True

    if not found_violation:
        result.add_pass()

def check_009_demo_mri_config(result: VerificationResult, env: str, project_root: Path) -> None:
    """
    Check 009: Verify MRI demo configuration is disabled.
    Rule: MRI-001
    """
    check_name = "CHECK-009: MRI Demo Configuration"

    mri_demo = os.environ.get("MRI_DEMO_MODE", "0").lower()
    if mri_demo in ("1", "true", "yes"):
        result.add_violation(Violation(
            rule_id="MRI-001",
            severity="CRITICAL",
            message=f"MRI_DEMO_MODE is enabled ({mri_demo}) — MRI analysis will use synthetic data",
            remediation="Set MRI_DEMO_MODE=0 before starting the application",
        ))
    else:
        result.add_pass()

def check_010_env_file_leaks(result: VerificationResult, project_root: Path) -> None:
    """
    Check 010: Scan .env files for production credentials mixed with demo config.
    Rule: CRIT-006
    """
    check_name = "CHECK-010: Environment File Leaks"
    found_violation = False

    for env_file in project_root.rglob(".env*"):
        if any(excluded in str(env_file) for excluded in EXCLUDE_DIRS):
            continue

        try:
            with open(env_file, 'r') as f:
                content = f.read()
        except (UnicodeDecodeError, PermissionError):
            continue

        # Check if production env file has demo flags
        if 'prod' in env_file.name.lower():
            for var_name in DEMO_ENV_VARS:
                pattern = re.compile(rf'^{re.escape(var_name)}\s*=\s*["\']?1["\']?', re.MULTILINE)
                if pattern.search(content):
                    result.add_violation(Violation(
                        rule_id="CRIT-006",
                        severity="CRITICAL",
                        message=f"Production env file {env_file.name} has {var_name}=1",
                        file_path=str(env_file),
                        remediation=f"Remove {var_name} from production env files",
                    ))
                    found_violation = True

    if not found_violation:
        result.add_pass()

def check_011_database_demo_isolation(result: VerificationResult, env: str) -> None:
    """
    Check 011: Verify database-level demo isolation.
    Rule: ENF-D-001, ENF-D-002
    """
    check_name = "CHECK-011: Database Demo Isolation"

    if env in PRODUCTION_ENVS:
        # In production, check that demo schema doesn't exist or is inaccessible
        # This requires database connection — skip if no connection available
        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            result.add_skip()
            return

        try:
            # Try to connect and check for demo schema
            import sqlalchemy
            engine = sqlalchemy.create_engine(db_url)
            with engine.connect() as conn:
                result_set = conn.execute(sqlalchemy.text(
                    "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'demo_data'"
                ))
                if result_set.fetchone():
                    result.add_violation(Violation(
                        rule_id="ENF-D-002",
                        severity="HIGH",
                        message="demo_data schema exists in production database",
                        remediation="Remove demo_data schema from production or revoke all access",
                    ))
                else:
                    result.add_pass()
        except ImportError:
            result.add_skip()  # sqlalchemy not available
        except Exception as e:
            result.add_violation(Violation(
                rule_id="ENF-D-002",
                severity="MEDIUM",
                message=f"Could not verify database isolation: {e}",
                remediation="Ensure database connection is available for verification",
            ))
    else:
        result.add_skip()

def check_012_response_headers(result: VerificationResult, env: str) -> None:
    """
    Check 012: Verify demo response headers are configured.
    Rule: ENF-A-001
    """
    check_name = "CHECK-012: Response Header Configuration"

    # Check if middleware is registered (heuristic: check config files)
    # In a real implementation, this would test an actual endpoint
    result.add_skip()  # Requires runtime — documented for manual verification


# ============================================================================
# MAIN
# ============================================================================

def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Verify demo/production boundary integrity",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    %(prog)s                                    # Auto-detect environment
    %(prog)s --env production --strict          # Strict production check
    %(prog)s --project-root /path/to/project    # Specify project root
        """
    )
    parser.add_argument(
        "--env",
        default=None,
        help="Environment name (default: APP_ENV env var or 'unknown')",
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Project root directory to scan (default: current directory)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail on MEDIUM severity violations too (default: only CRITICAL and HIGH)",
    )
    parser.add_argument(
        "--checks",
        nargs="+",
        choices=[f"check_{i:03d}" for i in range(1, 13)],
        help="Run only specified checks",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON",
    )
    return parser.parse_args()


def run_checks(args: argparse.Namespace) -> VerificationResult:
    """Run all verification checks."""
    env = (args.env or os.environ.get("APP_ENV", "unknown")).lower()
    project_root = args.project_root.resolve()

    result = VerificationResult()

    # Define all checks
    all_checks = [
        ("check_001", lambda: check_001_env_vars(result, env)),
        ("check_002", lambda: check_002_fly_toml(result, env, project_root)),
        ("check_003", lambda: check_003_demo_seed_backdoor(result, project_root)),
        ("check_004", lambda: check_004_example_com_emails(result, project_root)),
        ("check_005", lambda: check_005_demo_table_queries(result, project_root)),
        ("check_006", lambda: check_006_decorator_usage(result, project_root)),
        ("check_007", lambda: check_007_demo_path_in_routes(result, project_root)),
        ("check_008", lambda: check_008_production_safety_assertions(result, project_root)),
        ("check_009", lambda: check_009_demo_mri_config(result, env, project_root)),
        ("check_010", lambda: check_010_env_file_leaks(result, project_root)),
        ("check_011", lambda: check_011_database_demo_isolation(result, env)),
        ("check_012", lambda: check_012_response_headers(result, env)),
    ]

    # Run selected or all checks
    for check_name, check_func in all_checks:
        if args.checks and check_name not in args.checks:
            result.add_skip()
            continue

        try:
            check_func()
        except Exception as e:
            result.add_violation(Violation(
                rule_id="SCRIPT-ERROR",
                severity="LOW",
                message=f"Check {check_name} failed with error: {e}",
                remediation="Investigate the script error and fix the check implementation",
            ))

    return result


def main() -> int:
    """Main entry point."""
    args = parse_args()
    result = run_checks(args)

    # Determine severity threshold
    if args.strict:
        failure_threshold = {"CRITICAL", "HIGH", "MEDIUM"}
    else:
        failure_threshold = {"CRITICAL", "HIGH"}

    # Count failures above threshold
    failing_violations = [
        v for v in result.violations if v.severity in failure_threshold
    ]

    # Output
    if args.json:
        import json as json_lib
        output = {
            "environment": args.env or os.environ.get("APP_ENV", "unknown"),
            "passed": result.checks_passed,
            "failed": result.checks_failed,
            "skipped": result.checks_skipped,
            "total_violations": len(result.violations),
            "critical_violations": sum(1 for v in result.violations if v.severity == "CRITICAL"),
            "high_violations": sum(1 for v in result.violations if v.severity == "HIGH"),
            "violations": [
                {
                    "rule_id": v.rule_id,
                    "severity": v.severity,
                    "message": v.message,
                    "file": v.file_path,
                    "line": v.line_number,
                    "remediation": v.remediation,
                }
                for v in result.violations
            ],
            "safe": len(failing_violations) == 0,
        }
        print(json_lib.dumps(output, indent=2))
    else:
        print(result.summary())
        print()
        if failing_violations:
            print(f"RESULT: UNSAFE — {len(failing_violations)} violation(s) above threshold")
            print("Deployment BLOCKED until violations are resolved.")
        elif result.violations:
            print(f"RESULT: WARNING — {len(result.violations)} violation(s) below threshold")
            print("Review recommended but deployment allowed.")
        else:
            print("RESULT: SAFE — No demo boundary violations detected.")

    # Exit code
    return 1 if failing_violations else 0


if __name__ == "__main__":
    sys.exit(main())
```

### 8.1 Running the Verification Script

```bash
# Run all checks in current environment
python verify_demo_boundary.py

# Strict mode — fail on MEDIUM severity too
python verify_demo_boundary.py --strict

# Run only in production environment
APP_ENV=production python verify_demo_boundary.py

# Run specific checks only
python verify_demo_boundary.py --checks check_001 check_009

# JSON output for CI integration
python verify_demo_boundary.py --json > boundary-report.json

# Specify project root
python verify_demo_boundary.py --project-root /path/to/deepsynaps
```

### 8.2 CI Integration

```yaml
# .github/workflows/boundary-check.yml
name: Demo/Production Boundary Check

on:
  pull_request:
    branches: [main, production]
  push:
    branches: [production]

jobs:
  boundary-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Run boundary verification (strict)
        run: |
          python scripts/verify_demo_boundary.py --strict --json > boundary-report.json
        continue-on-error: false
      
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: boundary-report
          path: boundary-report.json
```

---

## 9. APPENDICES

### Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Demo Data** | Synthetic data created for demonstration, testing, or development purposes |
| **Synthetic Data** | Artificially generated data that mimics real data patterns but does not represent real patients |
| **Mock Data** | Hardcoded or randomly generated data used in place of real data for testing |
| **Demo Mode** | An operational mode where the system uses demo/synthetic data instead of real clinical data |
| **Boundary Violation** | Any situation where demo data enters a production code path, database, or API response |
| **Production Environment** | Any environment serving real clinicians and real patient data |
| **Clinical-Grade Data** | Data that meets regulatory and clinical standards for patient care decisions |

### Appendix B: Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────────┐
│           DEMO/PRODUCTION BOUNDARY — QUICK REFERENCE               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FUNDAMENTAL RULES:                                                 │
│  F-1: Demo data NEVER mixes with production data                   │
│  F-2: Demo mode is explicitly opt-in (5 conditions required)       │
│  F-3: Demo endpoints use /demo/ path                               │
│  F-4: Demo responses carry X-Demo-Mode: true                      │
│  F-5: Demo data in separate database schema                        │
│  F-6: Responses are 100% demo OR 100% production                   │
│  F-7: One demo component taints entire response                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CRITICAL ACTIONS:                                                  │
│  ☐ MRI_DEMO_MODE = "0" in production fly.toml                     │
│  ☐ Remove env-var backdoor from demo_seed_enabled()               │
│  ☐ Add @demo_endpoint to all demo functions                       │
│  ☐ Add assert_not_production() to all demo entry points            │
│  ☐ Deploy DemoModeHeaderMiddleware                                 │
│  ☐ Deploy demo_router_guard middleware                             │
│  ☐ Run verify_demo_boundary.py in CI                               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  VERIFICATION:                                                      │
│  $ python verify_demo_boundary.py --strict                        │
│  Exit 0 = SAFE  |  Exit 1 = UNSAFE                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Appendix C: Incident Response Playbook

```markdown
# Incident Response: Demo Data in Production

## Detection
Alert fires: "Demo boundary violation detected"

## Immediate Actions (< 5 minutes)
1. Acknowledge alert in PagerDuty
2. Determine scope: Which feature, which endpoint, which data
3. If active demo mode detected in production:
   - Set env var to disable: `MRI_DEMO_MODE=0`
   - Restart affected services
   - Block demo endpoints at load balancer

## Short-Term Actions (< 1 hour)
1. Query audit log for affected records
2. Identify if any clinicians received demo data
3. Document all findings in incident ticket
4. Notify clinical operations if patient safety impact

## Investigation (< 24 hours)
1. Run verify_demo_boundary.py on affected systems
2. Review code changes that introduced the leak
3. Check CI/CD pipeline for bypassed gates
4. Interview developers who deployed the change

## Remediation (< 1 week)
1. Fix root cause per remediation plan (Section 5)
2. Add missing detection/enforcement rules
3. Update CI gates to prevent recurrence
4. Conduct team post-mortem

## Communication
- Security team: Immediate
- Engineering leadership: Within 1 hour
- Clinical operations: If patient data affected
- Compliance: Within 24 hours
```

### Appendix D: Feature Boundary Matrix

| Feature | Demo Allowed | Production Safe | Separate Storage | Header Required | Auto-Block |
|---------|-------------|-----------------|------------------|-----------------|------------|
| MRI Analysis | Dev/Test only | No fallback | Yes | X-Demo-Mode | Yes |
| qEEG Analysis | Dev/Test only | No fallback | Yes | X-Demo-Mode | Yes |
| Voice Engine | Dev/Test only | Marked fallback | Yes | X-Voice-Fallback | Yes |
| Medication | Dev/Test only | FAERS only | Yes | X-Data-Source | Yes |
| Patient Data | Never | No demo patients | Yes | X-Demo-Mode | Yes |
| Payment | Never | Zero tolerance | N/A | N/A | Hard block |
| Wearables | Dev/Test only | Demo patients only | Yes | X-Demo-Mode | Yes |
| Evidence | Dev/Test only | Research disclaimer | Yes | X-Research-Only | Yes |
| Adverse Events | Never | FAERS read-only | Yes | X-Confidence | Yes |

---

> **END OF DOCUMENT**
>
> This document is a living specification. All changes require:
> 1. Security team review and approval
> 2. Updated verification script
> 3. Updated CI/CD gates
> 4. Team notification and training
>
> **Last Updated:** 2024  
> **Next Review:** Monthly  
> **Document Owner:** Security Engineering Team
