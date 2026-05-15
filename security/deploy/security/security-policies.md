# DeepSynaps Protocol Studio — Security Policies

**Version:** 1.0  
**Effective Date:** 2024-06-01  
**Classification:** Internal — Restricted  
**Owner:** Security Engineering Team  
**Review Cycle:** Quarterly  

---

## 1. Purpose and Scope

This document defines the information security policies for the DeepSynaps Protocol Studio — a clinical neuromodulation platform that handles protected health information (PHI) under the Health Insurance Portability and Accountability Act (HIPAA).

These policies apply to all employees, contractors, vendors, and systems that access, process, store, or transmit data within the DeepSynaps Protocol Studio environment.

### Regulatory Framework

| Regulation | Scope |
|-----------|-------|
| HIPAA Security Rule (45 CFR Part 160 & 164) | All PHI handling |
| HIPAA Privacy Rule (45 CFR Part 160 & 164 Subpart E) | Patient data disclosure |
| HITECH Act | Breach notification, business associates |
| State Privacy Laws | State-specific requirements |

---

## 2. Access Control Policies

### 2.1 Role-Based Access Control (RBAC)

The platform enforces RBAC with the following roles:

| Role | Description | Data Access |
|------|-------------|-------------|
| `admin` | System administrator | Full system access |
| `clinician` | Licensed healthcare provider | Own clinic's patients |
| `clinician_pro` | Advanced clinician | Own clinic + analytics |
| `researcher` | Research staff | De-identified datasets only |
| `patient` | Patient/portal user | Own records only |
| `caregiver` | Authorized caregiver | Granted scope only |

### 2.2 Access Control Requirements

- **Unique User Identification** (§164.312(a)(2)(i)): Every user must have a unique identifier. Shared accounts are prohibited.
- **Emergency Access Procedure** (§164.312(a)(2)(ii)): Break-glass accounts are available for emergencies, with automatic audit logging and post-incident review.
- **Automatic Logoff** (§164.312(a)(2)(iii)): Sessions expire after 60 minutes of inactivity.
- **Encryption and Decryption** (§164.312(a)(2)(iv)): All PHI at rest uses AES-256 encryption. TLS 1.2+ for data in transit.

### 2.3 Cross-Clinic Isolation (IDOR Prevention)

- Every patient record is scoped to a `clinic_id`.
- API endpoints MUST validate that `actor.clinic_id` matches the resource's `clinic_id`.
- Direct object reference attacks are blocked at the repository layer.
- Automated tests verify IDOR prevention on every router.

### 2.4 Access Review

| Frequency | Action |
|-----------|--------|
| Weekly | Automated review of admin access logs |
| Monthly | Manager review of role assignments |
| Quarterly | Full access recertification |
| On-demand | Access revocation upon role change |

---

## 3. Data Classification

### 3.1 Classification Levels

```
┌─────────────────────────────────────────────────────────────┐
│  CRITICAL  │  PHI — Patient health records, qEEG data,       │
│  (Red)     │  treatment protocols, neuroimaging              │
├─────────────────────────────────────────────────────────────┤
│  HIGH      │  PII — Staff credentials, API keys, payment     │
│  (Orange)  │  card tokens, audit logs                        │
├─────────────────────────────────────────────────────────────┤
│  MEDIUM    │  Business — Clinic configs, pricing, usage      │
│  (Yellow)  │  analytics (non-PHI)                            │
├─────────────────────────────────────────────────────────────┤
│  LOW       │  Public — Marketing content, API documentation, │
│  (Green)   │  open evidence data                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Data Handling Requirements by Classification

| Classification | Encryption at Rest | Encryption in Transit | Access Logging | Retention |
|----------------|-------------------|----------------------|----------------|-----------|
| CRITICAL (PHI) | AES-256-GCM | TLS 1.3 | Full audit trail | 7 years post-treatment |
| HIGH (PII) | AES-256-GCM | TLS 1.2+ | Full audit trail | 7 years |
| MEDIUM | AES-256 | TLS 1.2+ | Standard logging | 3 years |
| LOW | Recommended | TLS 1.2+ | Minimal | 1 year |

---

## 4. Encryption Requirements

### 4.1 Encryption at Rest

- **Database**: All PHI fields encrypted with AES-256-GCM.
- **File Storage**: Media uploads encrypted with AES-256.
- **Backups**: Encrypted before transfer to backup storage.
- **Encryption Keys**: Managed via HashiCorp Vault or cloud KMS (AWS KMS / GCP KMS). Never stored in application code.

### 4.2 Encryption in Transit

- **TLS Version**: TLS 1.3 required. TLS 1.2 minimum accepted.
- **Cipher Suites**: Only ECDHE with AES-GCM or ChaCha20-Poly1305.
- **Certificate Management**: Automated rotation via Let's Encrypt or managed certificates.
- **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production.

### 4.3 Key Management

| Key Type | Rotation Period | Storage |
|----------|----------------|---------|
| TLS certificates | 90 days | Vault / Let's Encrypt |
| JWT signing keys | 90 days | Vault |
| Database encryption keys | 1 year | Cloud KMS |
| API keys | On suspected compromise | Vault |
| Fernet keys (settings) | 180 days | Vault |

---

## 5. Authentication Requirements

### 5.1 Authentication Methods

- **Primary**: JWT-based authentication with HS256/RS256.
- **Secondary**: API key authentication for service-to-service calls.
- **MFA**: Required for admin accounts. TOTP-based.
- **Session Management**: Access tokens expire in 60 minutes. Refresh tokens expire in 30 days.

### 5.2 Password Policy

```
Minimum length:        12 characters
Complexity:            Upper, lower, digit, special char
History:               12 previous passwords
Maximum age:           90 days
Lockout:               5 failed attempts → 30-minute lockout
Password hashing:      Argon2id (memory: 64MB, iterations: 3, parallelism: 4)
```

### 5.3 Token Security

- JWTs are signed with a minimum 256-bit secret.
- Token payloads MUST NOT contain PHI in plaintext claims.
- Refresh tokens are single-use and rotated on every access token refresh.
- Tokens are invalidated on password change or session revocation.

---

## 6. Audit Logging Requirements

### 6.1 Required Audit Events

All of the following events MUST be logged with timestamp, actor, action, and outcome:

| Event Category | Specific Events |
|---------------|-----------------|
| Authentication | Login success/failure, logout, token refresh, MFA verification |
| Authorization | Access denied, role changes, permission grants/revocations |
| Data Access | Patient record viewed, modified, exported, deleted |
| Admin Actions | Secret rotation, config changes, user provisioning |
| Security | Rate limit triggered, suspicious activity detected, scan results |

### 6.2 Audit Log Format

```json
{
  "timestamp": "2024-06-01T12:00:00Z",
  "event_type": "patient_record_access",
  "actor": {
    "id": "actor-clinician-001",
    "type": "clinician",
    "clinic_id": "clinic-001",
    "ip_address": "192.168.1.100"
  },
  "resource": {
    "type": "patient",
    "id": "patient-001",
    "clinic_id": "clinic-001"
  },
  "action": "read",
  "outcome": "success",
  "request_id": "req-uuid-1234"
}
```

### 6.3 Log Protection

- Audit logs are immutable (append-only, write-once storage).
- Logs are retained for 7 years.
- Log access requires admin role + MFA.
- Log integrity verified with cryptographic checksums (SHA-256).

---

## 7. Incident Response Policy

### 7.1 Incident Classification

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| P1 — Critical | Active PHI breach, ransomware, system compromise | 15 minutes |
| P2 — High | Potential breach, large-scale vulnerability exposure | 1 hour |
| P3 — Medium | Security control failure, policy violation | 4 hours |
| P4 — Low | Documentation gap, minor misconfiguration | 24 hours |

### 7.2 Breach Notification

- **Internal**: Security team notified within 15 minutes of P1/P2 detection.
- **Patients**: Notification within 60 days if PHI is reasonably believed to be compromised.
- **HHS OCR**: Notification within 60 days for breaches affecting 500+ individuals.
- **Media**: Notification required for 500+ affected individuals.
- **Business Associates**: Notification within 24 hours of discovery.

### 7.3 Incident Response Steps

1. **Detect** — Automated monitoring + manual reporting.
2. **Contain** — Isolate affected systems, revoke compromised credentials.
3. **Eradicate** — Remove root cause, patch vulnerabilities.
4. **Recover** — Restore from clean backups, verify integrity.
5. **Post-Incident** — Root cause analysis, remediation, policy update.

See [incident-response-plan.md](../../docs/security/incident-response-plan.md) for detailed procedures.

---

## 8. Third-Party and Vendor Security

### 8.1 Business Associate Agreements (BAA)

- All vendors processing PHI must sign a BAA.
- Vendors must demonstrate HIPAA/HITECH compliance.
- Annual security assessments required for critical vendors.

### 8.2 Approved Vendors

| Service | Vendor | BAA Status | Data Class |
|---------|--------|-----------|------------|
| Cloud hosting | AWS/GCP | Signed | CRITICAL |
| Error tracking | Sentry | Signed | HIGH |
| Payments | Stripe | Signed | HIGH |
| AI/LLM | Anthropic | Signed | MEDIUM |
| Email delivery | SendGrid/Mailgun | Signed | MEDIUM |

---

## 9. Secure Development

### 9.1 SDLC Security Gates

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Design  │───→│  Develop │───→│   Test   │───→│  Deploy  │───→│  Monitor │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     ▼               ▼               ▼               ▼               ▼
 Threat Model    SAST/Bandit     DAST/ZAP       Image Scan      Runtime
 Privacy Review   Secret Scan     Unit Tests     Headers Check   SIEM Alerts
                  Dependency      Pen Test       Approval Gate   Anomaly Detect
                  Audit
```

### 9.2 Security Testing Requirements

| Test Type | Tool | Stage | Gate |
|-----------|------|-------|------|
| SAST | Bandit, Semgrep, ESLint | CI (every PR) | Block on HIGH |
| Secret Scan | gitleaks, custom | CI (every PR) | Block on findings |
| Dependency Audit | pip-audit, npm audit, Trivy | CI (weekly + PR) | Block on CRITICAL |
| DAST | OWASP ZAP | Post-deploy staging | Block on HIGH |
| Header Validation | check-security-headers.sh | Post-deploy | Block on failures |
| Container Scan | Trivy | CI (every build) | Block on CRITICAL |

---

## 10. Policy Violations

Violations of these security policies may result in:

- Immediate access revocation
- Disciplinary action up to and including termination
- Legal action for criminal violations
- Reporting to regulatory authorities (HIPAA/HHS OCR)

### Reporting Violations

Security concerns can be reported to:
- **Email:** security@deepsynaps.io
- **Anonymous:** https://deepsynaps.io/security-report (no login required)
- **Emergency:** +1-XXX-XXX-XXXX (24/7 hotline)

---

## 11. Policy Review and Maintenance

| Action | Frequency | Owner |
|--------|-----------|-------|
| Policy review | Quarterly | Security Engineering |
| Penetration test | Annually | External vendor |
| Vulnerability assessment | Monthly | Security Engineering |
| Compliance audit | Annually | External auditor |
| Tabletop exercise | Semi-annually | Incident Response Team |

---

## Appendix A: HIPAA Security Rule Mapping

| HIPAA Section | Requirement | Policy Reference |
|---------------|-------------|-----------------|
| §164.308(a)(1)(i) | Security Management Process | Sections 2, 5, 9 |
| §164.308(a)(3) | Workforce Security | Section 2.1 |
| §164.308(a)(4) | Information Access Management | Section 2.2, 2.3 |
| §164.308(a)(5) | Security Awareness Training | Section 9 |
| §164.308(a)(6) | Security Incident Procedures | Section 7 |
| §164.308(a)(7) | Contingency Plan | Incident Response Plan |
| §164.308(a)(8) | Evaluation | Section 11 |
| §164.312(a)(1) | Access Control | Sections 2, 5 |
| §164.312(a)(2)(i) | Unique User ID | Section 2.2 |
| §164.312(a)(2)(ii) | Emergency Access | Section 2.2 |
| §164.312(a)(2)(iii) | Automatic Logoff | Section 5.2 |
| §164.312(a)(2)(iv) | Encryption/Decryption | Section 4 |
| §164.312(b) | Audit Controls | Section 6 |
| §164.312(c)(1) | Integrity | Section 4.2 |
| §164.312(d) | Person/Entity Authentication | Section 5.1 |
| §164.312(e)(1) | Transmission Security | Section 4.2 |
| §164.312(e)(2)(i) | Integrity Controls | Section 4.2 |
| §164.312(e)(2)(ii) | Encryption | Section 4 |

---

*Document version 1.0 — Last updated 2024-06-01*  
*Next review date: 2024-09-01*
