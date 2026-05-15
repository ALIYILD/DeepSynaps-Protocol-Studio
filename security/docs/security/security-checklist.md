# DeepSynaps Protocol Studio — Security Hardening Checklist

**Use this checklist before every production deployment and quarterly for infrastructure review.**

---

## Checklist Legend

- [ ] Unchecked — not yet verified
- [x] Checked — verified and passing
- [-] N/A — not applicable to this environment
- [!] Risk accepted — documented exception

---

## 1. Pre-Deployment Security Checks

### 1.1 Code Security

| # | Check | Tool / Method | Priority | Status |
|---|-------|--------------|----------|--------|
| 1.1.1 | Bandit SAST scan — zero HIGH findings | `bandit -r apps/api/` | **BLOCKING** | ☐ |
| 1.1.2 | Semgrep scan — zero ERROR-level findings | `semgrep --config p/owasp-top-ten` | **BLOCKING** | ☐ |
| 1.1.3 | ESLint security scan — zero errors | `eslint --ext .ts,.tsx plugin:security/recommended` | **BLOCKING** | ☐ |
| 1.1.4 | No secrets in codebase | `gitleaks detect` + manual review | **BLOCKING** | ☐ |
| 1.1.5 | No hardcoded credentials in source | `grep -r "password\|secret\|token" --include="*.py"` | **BLOCKING** | ☐ |
| 1.1.6 | JWT secret is ≥256 bits and from secure RNG | `openssl rand -hex 32` | **BLOCKING** | ☐ |
| 1.1.7 | All API endpoints have authentication | Review router decorators + tests | **BLOCKING** | ☐ |
| 1.1.8 | All patient endpoints enforce clinic isolation | `grep -r "clinic_id" app/routers/` | **BLOCKING** | ☐ |
| 1.1.9 | Input validation on all request schemas | Pydantic v2 model review | **BLOCKING** | ☐ |
| 1.1.10 | SQL injection prevention — parameterized queries | SQLAlchemy ORM review | **BLOCKING** | ☐ |
| 1.1.11 | No eval() or exec() patterns | `grep -r "eval\|exec" --include="*.py"` | **BLOCKING** | ☐ |

### 1.2 Dependency Security

| # | Check | Tool / Method | Priority | Status |
|---|-------|--------------|----------|--------|
| 1.2.1 | Python dependencies — zero CRITICAL CVEs | `pip-audit` | **BLOCKING** | ☐ |
| 1.2.2 | Node.js dependencies — zero CRITICAL CVEs | `npm audit` | **BLOCKING** | ☐ |
| 1.2.3 | Container image — zero CRITICAL CVEs | `trivy image deepsynaps-api` | **BLOCKING** | ☐ |
| 1.2.4 | All dependencies pinned with hash verification | `requirements.txt` / `package-lock.json` | **BLOCKING** | ☐ |
| 1.2.5 | No deprecated or unmaintained dependencies | `pip list --outdated` / `npm outdated` | Medium | ☐ |
| 1.2.6 | License compliance check | `pip-licenses` / `license-checker` | Low | ☐ |

### 1.3 Configuration Security

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 1.3.1 | `DEEPSYNAPS_APP_ENV=production` is set | Environment variable review | **BLOCKING** | ☐ |
| 1.3.2 | DEBUG mode disabled in production | `settings.py` review | **BLOCKING** | ☐ |
| 1.3.3 | CORS origins restricted (no `*`) | `DEEPSYNAPS_CORS_ORIGINS` review | **BLOCKING** | ☐ |
| 1.3.4 | Rate limiting enabled | `SlowAPI` middleware check | **BLOCKING** | ☐ |
| 1.3.5 | Request body size limit configured | `media_max_upload_bytes` setting | **BLOCKING** | ☐ |
| 1.3.6 | JWT token expiry ≤ 60 minutes | `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | **BLOCKING** | ☐ |
| 1.3.7 | Database connection uses SSL | `sslmode=require` in DB URL | **BLOCKING** | ☐ |
| 1.3.8 | Sentry DSN uses correct project/environment | Sentry config review | Medium | ☐ |
| 1.3.9 | Error messages don't leak stack traces in prod | Exception handler review | **BLOCKING** | ☐ |
| 1.3.10 | Log level appropriate (INFO in prod) | `DEEPSYNAPS_LOG_LEVEL` | Medium | ☐ |
| 1.3.11 | Health endpoints don't expose sensitive data | `/health` response review | **BLOCKING** | ☐ |

---

## 2. Infrastructure Hardening

### 2.1 Network Security

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 2.1.1 | TLS 1.3 enabled, TLS 1.2 minimum | SSL Labs test / `openssl s_client` | **BLOCKING** | ☐ |
| 2.1.2 | HSTS header with includeSubDomains | `check-security-headers.sh` | **BLOCKING** | ☐ |
| 2.1.3 | No HTTP (port 80) exposure — redirect to HTTPS | Port scan / curl test | **BLOCKING** | ☐ |
| 2.1.4 | Firewall rules restrict database access | Cloud security group review | **BLOCKING** | ☐ |
| 2.1.5 | Database not publicly accessible | Network reachability test | **BLOCKING** | ☐ |
| 2.1.6 | API rate limiting configured per-IP and per-user | `SlowAPI` config review | **BLOCKING** | ☐ |
| 2.1.7 | DDoS protection enabled (CloudFlare/AWS Shield) | Cloud provider console | Medium | ☐ |
| 2.1.8 | VPC/isolated network for internal services | Infrastructure review | **BLOCKING** | ☐ |

### 2.2 Container Security

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 2.2.1 | Container runs as non-root user | Dockerfile `USER` directive | **BLOCKING** | ☐ |
| 2.2.2 | Read-only root filesystem | `read_only: true` in compose/K8s | **BLOCKING** | ☐ |
| 2.2.3 | No unnecessary capabilities | `drop ALL` + add only required | **BLOCKING** | ☐ |
| 2.2.4 | Resource limits configured (CPU/memory) | K8s limits / Docker limits | Medium | ☐ |
| 2.2.5 | HEALTHCHECK defined in Dockerfile | `HEALTHCHECK` instruction | **BLOCKING** | ☐ |
| 2.2.6 | Multi-stage build — no build tools in final image | Dockerfile review | **BLOCKING** | ☐ |
| 2.2.7 | Base image is minimal (distroless or slim) | FROM directive review | Medium | ☐ |
| 2.2.8 | Image scanned for CVEs before deployment | Trivy in CI pipeline | **BLOCKING** | ☐ |

### 2.3 Database Security

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 2.3.1 | Database encryption at rest enabled | Cloud provider setting | **BLOCKING** | ☐ |
| 2.3.2 | Automated backups encrypted | Backup configuration review | **BLOCKING** | ☐ |
| 2.3.3 | Backup retention ≥ 30 days | Backup policy review | **BLOCKING** | ☐ |
| 2.3.4 | Database audit logging enabled | PostgreSQL `pgaudit` / cloud audit | **BLOCKING** | ☐ |
| 2.3.5 | Connection pooling with max connection limits | Pool configuration | Medium | ☐ |
| 2.3.6 | Database credentials rotated within last 90 days | `rotate-secrets.sh --dry-run` | **BLOCKING** | ☐ |
| 2.3.7 | Separate read/write database users where applicable | User privilege review | Low | ☐ |

### 2.4 Secrets Management

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 2.4.1 | No secrets in environment variables on host | Vault / secret manager audit | **BLOCKING** | ☐ |
| 2.4.2 | JWT secret stored in Vault/KMS, not in code/env | Secret storage review | **BLOCKING** | ☐ |
| 2.4.3 | API keys stored in Vault, not in config files | Secret storage review | **BLOCKING** | ☐ |
| 2.4.4 | Database password stored in Vault, not in connection string | Connection string review | **BLOCKING** | ☐ |
| 2.4.5 | Secret rotation performed within last 90 days | Rotation log review | **BLOCKING** | ☐ |
| 2.4.6 | Secret rotation procedure documented and tested | `rotate-secrets.sh` dry-run | **BLOCKING** | ☐ |

---

## 3. Application Hardening

### 3.1 Security Headers

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 3.1.1 | `Strict-Transport-Security` present with max-age ≥ 1 year | `check-security-headers.sh` | **BLOCKING** | ☐ |
| 3.1.2 | `X-Content-Type-Options: nosniff` present | `check-security-headers.sh` | **BLOCKING** | ☐ |
| 3.1.3 | `X-Frame-Options: DENY` present | `check-security-headers.sh` | **BLOCKING** | ☐ |
| 3.1.4 | `Content-Security-Policy` present and non-permissive | `check-security-headers.sh` | **BLOCKING** | ☐ |
| 3.1.5 | `Referrer-Policy` present | `check-security-headers.sh` | **BLOCKING** | ☐ |
| 3.1.6 | `Permissions-Policy` present | `check-security-headers.sh` | **BLOCKING** | ☐ |
| 3.1.7 | `X-XSS-Protection: 1; mode=block` present | `check-security-headers.sh` | Medium | ☐ |
| 3.1.8 | Server header doesn't expose version | `check-security-headers.sh` | Medium | ☐ |
| 3.1.9 | No `X-Powered-By` header | `check-security-headers.sh` | Low | ☐ |

### 3.2 Authentication & Authorization

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 3.2.1 | All API routes have auth dependency | `grep -r "Depends.*auth" app/routers/` | **BLOCKING** | ☐ |
| 3.2.2 | Login endpoint has rate limiting | `SlowAPI` decorator check | **BLOCKING** | ☐ |
| 3.2.3 | Password reset flow requires email verification | Code review | **BLOCKING** | ☐ |
| 3.2.4 | Failed login attempts are logged | Audit log review | **BLOCKING** | ☐ |
| 3.2.5 | Session tokens invalidated on logout | Token revocation check | **BLOCKING** | ☐ |
| 3.2.6 | Admin endpoints require admin role | Role decorator review | **BLOCKING** | ☐ |
| 3.2.7 | Clinic isolation prevents cross-clinic data access | IDOR test suite | **BLOCKING** | ☐ |
| 3.2.8 | Patient portal endpoints enforce patient ownership | Authorization test | **BLOCKING** | ☐ |

### 3.3 Input Validation

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 3.3.1 | All request bodies use Pydantic v2 models | Router code review | **BLOCKING** | ☐ |
| 3.3.2 | Path parameters have type constraints | FastAPI path param review | **BLOCKING** | ☐ |
| 3.3.3 | File uploads validate MIME type and size | Upload handler review | **BLOCKING** | ☐ |
| 3.3.4 | SQL queries use ORM, no raw SQL concatenation | Code review | **BLOCKING** | ☐ |
| 3.3.5 | Output encoding for all user-generated content | Response model review | **BLOCKING** | ☐ |
| 3.3.6 | API schema doesn't expose internal field names | OpenAPI schema review | Medium | ☐ |

---

## 4. Data Protection Checks

### 4.1 PHI Handling

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 4.1.1 | PHI never logged in plain text | Log sanitizer review | **BLOCKING** | ☐ |
| 4.1.2 | PHI not exposed in error messages | Error handler review | **BLOCKING** | ☐ |
| 4.1.3 | PHI not stored in browser localStorage/sessionStorage | Frontend code review | **BLOCKING** | ☐ |
| 4.1.4 | PHI redacted in analytics and monitoring | Data pipeline review | **BLOCKING** | ☐ |
| 4.1.5 | Patient consent recorded before data processing | Consent router review | **BLOCKING** | ☐ |
| 4.1.6 | Data minimization — only collect necessary PHI | Schema review | **BLOCKING** | ☐ |

### 4.2 Encryption Verification

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 4.2.1 | TLS certificate valid and not expiring soon | `openssl x509 -checkend` | **BLOCKING** | ☐ |
| 4.2.2 | TLS certificate uses strong key (RSA ≥ 2048 or ECDSA) | Certificate inspection | **BLOCKING** | ☐ |
| 4.2.3 | Database encryption at rest verified | Sample query + verification | **BLOCKING** | ☐ |
| 4.2.4 | Backup encryption verified | Restore test from encrypted backup | **BLOCKING** | ☐ |
| 4.2.5 | API key encryption (Fernet) functional | Encryption/decryption test | **BLOCKING** | ☐ |

---

## 5. Monitoring and Alerting

### 5.1 Security Monitoring

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 5.1.1 | Sentry alerts configured for security exceptions | Sentry alert rules | **BLOCKING** | ☐ |
| 5.1.2 | Failed login alerts trigger within 5 minutes | Alert rule test | **BLOCKING** | ☐ |
| 5.1.3 | Rate limit violation alerts enabled | Monitoring dashboard | **BLOCKING** | ☐ |
| 5.1.4 | Unusual API access pattern detection enabled | SIEM / anomaly detection | Medium | ☐ |
| 5.1.5 | Database slow query alerts enabled | PostgreSQL/cloud monitoring | Medium | ☐ |
| 5.1.6 | Secret rotation reminder alerts configured | Calendar/automation check | Medium | ☐ |

### 5.2 Audit and Compliance

| # | Check | Method | Priority | Status |
|---|-------|--------|----------|--------|
| 5.2.1 | Audit trail captures all data access events | Audit log review | **BLOCKING** | ☐ |
| 5.2.2 | Audit logs are tamper-evident | Checksum/hash verification | **BLOCKING** | ☐ |
| 5.2.3 | Audit log retention meets 7-year requirement | Storage policy review | **BLOCKING** | ☐ |
| 5.2.4 | Security scan results archived | CI/CD artifact review | **BLOCKING** | ☐ |
| 5.2.5 | Previous security incidents documented | Incident log review | **BLOCKING** | ☐ |
| 5.2.6 | Access reviews performed and documented | Review log check | **BLOCKING** | ☐ |

---

## 6. Compliance Verification

### 6.1 HIPAA Security Rule

| # | HIPAA Section | Control | Status |
|---|---------------|---------|--------|
| 6.1.1 | §164.308(a)(1)(i) | Security Management Process | ☐ |
| 6.1.2 | §164.308(a)(3) | Workforce Security | ☐ |
| 6.1.3 | §164.308(a)(4) | Information Access Management | ☐ |
| 6.1.4 | §164.308(a)(5) | Security Awareness & Training | ☐ |
| 6.1.5 | §164.308(a)(6) | Security Incident Procedures | ☐ |
| 6.1.6 | §164.308(a)(7) | Contingency Plan | ☐ |
| 6.1.7 | §164.308(a)(8) | Periodic Evaluation | ☐ |
| 6.1.8 | §164.312(a)(1) | Access Control | ☐ |
| 6.1.9 | §164.312(a)(2)(i) | Unique User Identification | ☐ |
| 6.1.10 | §164.312(a)(2)(ii) | Emergency Access Procedure | ☐ |
| 6.1.11 | §164.312(a)(2)(iii) | Automatic Logoff | ☐ |
| 6.1.12 | §164.312(a)(2)(iv) | Encryption & Decryption | ☐ |
| 6.1.13 | §164.312(b) | Audit Controls | ☐ |
| 6.1.14 | §164.312(c)(1) | Integrity Controls | ☐ |
| 6.1.15 | §164.312(d) | Person/Entity Authentication | ☐ |
| 6.1.16 | §164.312(e)(1) | Transmission Security | ☐ |
| 6.1.17 | §164.312(e)(2)(i) | Integrity Controls (transmission) | ☐ |
| 6.1.18 | §164.312(e)(2)(ii) | Encryption (transmission) | ☐ |

### 6.2 HITRUST Controls

| # | HITRUST Domain | Control | Status |
|---|----------------|---------|--------|
| 6.2.1 | 01 — Information Security Management | Policy framework | ☐ |
| 6.2.2 | 02 — Human Resources Security | Background checks, training | ☐ |
| 6.2.3 | 03 — Asset Management | Data classification | ☐ |
| 6.2.4 | 04 — Access Control | RBAC, MFA, least privilege | ☐ |
| 6.2.5 | 05 — Cryptography | Encryption standards | ☐ |
| 6.2.6 | 06 — Physical Security | Data center/cloud security | ☐ |
| 6.2.7 | 07 — Operations Security | Change management, monitoring | ☐ |
| 6.2.8 | 08 — Communications Security | Network security, TLS | ☐ |
| 6.2.9 | 09 — System Development | SDLC security, code review | ☐ |
| 6.2.10 | 10 — Supplier Relationships | Vendor management, BAAs | ☐ |
| 6.2.11 | 11 — Incident Management | IR plan, detection, response | ☐ |
| 6.2.12 | 12 — Business Continuity | Backup, disaster recovery | ☐ |
| 6.2.13 | 13 — Compliance | Legal, regulatory compliance | ☐ |

---

## 7. Emergency Deployment Override

In the event of a critical security incident requiring immediate deployment (e.g., active exploitation of a vulnerability):

| Step | Action | Owner |
|------|--------|-------|
| 1 | Declare emergency override in GitHub Actions: `emergency_override=true` | On-call Engineer |
| 2 | Document business justification in incident ticket | On-call Engineer |
| 3 | Deploy with override | On-call Engineer |
| 4 | Post-deployment: run full security audit within 4 hours | Security Team |
| 5 | Security review within 24 hours | Security Lead |
| 6 | Retroactive security scanning + remediation if needed | Security Team |
| 7 | Incident review within 1 week | All stakeholders |

**Override is tracked and requires security team sign-off within 24 hours.**

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Engineer | _______________ | ________ | ___________ |
| DevOps Lead | _______________ | ________ | ___________ |
| Engineering Lead | _______________ | ________ | ___________ |
| Compliance Officer | _______________ | ________ | ___________ |

---

*Checklist version 1.0 — Use with `security-audit.sh --output-format markdown`*  
*Last updated: 2024-06-01*
