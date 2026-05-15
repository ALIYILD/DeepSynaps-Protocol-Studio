# DeepSynaps Protocol Studio — Platform Operations, Observability & Infrastructure Monitoring Design

**Document Version:** 1.0  
**Date:** 2025-01-21  
**Classification:** Internal Technical Specification  
**Target Length:** 2,000+ lines  
**Scope:** Healthcare SaaS infrastructure operations, observability, platform monitoring, SRE practices, and cost management for the DeepSynaps multi-tenant neuropsychiatric platform.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Infrastructure Monitoring](#2-infrastructure-monitoring)
   - 2.1 [API Uptime & Health Checks](#21-api-uptime--health-checks)
   - 2.2 [Database Performance](#22-database-performance)
   - 2.3 [Storage Usage & Growth](#23-storage-usage--growth)
   - 2.4 [Network Latency](#24-network-latency)
   - 2.5 [SSL Certificate Monitoring](#25-ssl-certificate-monitoring)
   - 2.6 [DNS Monitoring](#26-dns-monitoring)
3. [Queue & Worker Health](#3-queue--worker-health)
   - 3.1 [Background Job Queues](#31-background-job-queues)
   - 3.2 [Job Success/Failure Rates](#32-job-successfailure-rates)
   - 3.3 [Queue Depth & Lag](#33-queue-depth--lag)
   - 3.4 [Worker Availability](#34-worker-availability)
   - 3.5 [Retry Handling](#35-retry-handling)
   - 3.6 [Dead Letter Queues](#36-dead-letter-queues)
4. [AI/ML Pipeline Monitoring](#4-aiml-pipeline-monitoring)
   - 4.1 [Inference Request Volume](#41-inference-request-volume)
   - 4.2 [Model Latency Distribution](#42-model-latency-distribution)
   - 4.3 [GPU Utilization](#43-gpu-utilization)
   - 4.4 [Model Accuracy Drift](#44-model-accuracy-drift)
   - 4.5 [Input/Output Validation](#45-inputoutput-validation)
   - 4.6 [A/B Test Monitoring](#46-ab-test-monitoring)
5. [Evidence DB & Research Pipeline](#5-evidence-db--research-pipeline)
   - 5.1 [Paper Ingestion Rate](#51-paper-ingestion-rate)
   - 5.2 [Search Query Volume](#52-search-query-volume)
   - 5.3 [Citation Update Frequency](#53-citation-update-frequency)
   - 5.4 [Database Sync Status](#54-database-sync-status)
   - 5.5 [Index Health](#55-index-health)
6. [MRI/qEEG Pipeline Health](#6-mriqeeg-pipeline-health)
   - 6.1 [Processing Queue Depth](#61-processing-queue-depth)
   - 6.2 [Analysis Completion Rate](#62-analysis-completion-rate)
   - 6.3 [Processing Time Trends](#63-processing-time-trends)
   - 6.4 [Error Rate by Analysis Type](#64-error-rate-by-analysis-type)
   - 6.5 [Storage Per Analysis](#65-storage-per-analysis)
7. [Cost Tracking](#7-cost-tracking)
   - 7.1 [Infrastructure Cost](#71-infrastructure-cost)
   - 7.2 [AI/ML Costs Per Clinic](#72-aiml-costs-per-clinic)
   - 7.3 [GPU Costs](#73-gpu-costs)
   - 7.4 [Storage Costs Per Analysis Type](#74-storage-costs-per-analysis-type)
   - 7.5 [API Cost Per Endpoint](#75-api-cost-per-endpoint)
   - 7.6 [Cost Per Clinic](#76-cost-per-clinic)
8. [Alerting Patterns](#8-alerting-patterns)
   - 8.1 [Severity Levels](#81-severity-levels)
   - 8.2 [Alert Routing](#82-alert-routing)
   - 8.3 [Alert Fatigue Prevention](#83-alert-fatigue-prevention)
   - 8.4 [Runbook Links](#84-runbook-links)
   - 8.5 [Escalation Policies](#85-escalation-policies)
   - 8.6 [On-Call Rotation](#86-on-call-rotation)
9. [SRE Best Practices](#9-sre-best-practices)
   - 9.1 [SLOs and SLIs](#91-slos-and-slis)
   - 9.2 [Error Budgets](#92-error-budgets)
   - 9.3 [Blameless Postmortems](#93-blameless-postmortems)
   - 9.4 [Chaos Engineering](#94-chaos-engineering)
   - 9.5 [Capacity Planning](#95-capacity-planning)
   - 9.6 [Disaster Recovery](#96-disaster-recovery)
10. [Dashboard Wireframes & Specifications](#10-dashboard-wireframes--specifications)
11. [Appendix A: Alert Configuration Examples](#11-appendix-a-alert-configuration-examples)
12. [Appendix B: SLO Definitions Table](#12-appendix-b-slo-definitions-table)
13. [Appendix C: Runbook Templates](#13-appendix-c-runbook-templates)
14. [Appendix D: Metric Collection Reference](#14-appendix-d-metric-collection-reference)
15. [References](#15-references)

---

## 1. Executive Summary

The DeepSynaps Protocol Studio is a multi-tenant healthcare SaaS platform that integrates neuroimaging (MRI), quantitative EEG (qEEG), AI-powered clinical decision support, and evidence-based research pipelines. Operating in the healthcare domain, the platform must maintain exceptional reliability, security, and observability to ensure patient safety, regulatory compliance (HIPAA, FDA 21 CFR Part 11, GDPR), and clinical trust.

This document establishes the comprehensive operations, observability, and monitoring design for the platform infrastructure. It covers eight critical domains:

| Domain | Criticality | Primary Stakeholders |
|--------|-----------|---------------------|
| Infrastructure Monitoring | Critical | Platform Engineering, DevOps |
| Queue & Worker Health | Critical | Backend Engineering, Data Engineering |
| AI/ML Pipeline Monitoring | Critical | ML Engineering, Clinical Data Science |
| Evidence DB & Research Pipeline | High | Research Team, Clinical Content |
| MRI/qEEG Pipeline Health | Critical | Neuroimaging Team, Clinical Operations |
| Cost Tracking | High | Engineering Leadership, Finance |
| Alerting Patterns | Critical | SRE, Platform Engineering |
| SRE Best Practices | Critical | All Engineering Teams |

### Key Principles

1. **Patient Safety First:** All monitoring and alerting designs prioritize the safety and privacy of patient data.
2. **Observability by Design:** Every component emits structured logs, metrics, and traces by default.
3. **Proactive Over Reactive:** The system detects anomalies before they become incidents.
4. **Cost Transparency:** All resource usage is attributable to clinics, analyses, and endpoints.
5. **Blameless Culture:** Postmortems focus on systemic improvements, not individual fault.

### Technology Stack for Observability

| Layer | Primary Tool | Backup/Secondary |
|-------|-------------|-----------------|
| Metrics | Prometheus + Thanos | Datadog (enterprise fallback) |
| Logs | Loki (Grafana Stack) | AWS CloudWatch Logs |
| Traces | Jaeger + OpenTelemetry | AWS X-Ray |
| Dashboards | Grafana | Custom React-based dashboards |
| Alerting | Alertmanager + PagerDuty | Opsgenie fallback |
| Uptime | Pingdom + Statuspage | UptimeRobot |
| APM | Grafana Tempo | New Relic (evaluation) |

---

## 2. Infrastructure Monitoring

### 2.1 API Uptime & Health Checks

API uptime is the most visible indicator of platform health. For a healthcare SaaS, even brief outages can disrupt clinical workflows, delay diagnoses, and erode trust.

#### 2.1.1 Health Check Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  External Probe │────▶│  Load Balancer   │────▶│  API Gateway    │
│  (Pingdom/GCP)  │     │  (Cloudflare/NGINX)│   │  (Kong/AWS ALB) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                    ┌──────────────────────────────────────┼──────────────────────────┐
                    │                                      │                          │
              ┌─────▼─────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
              │ /health   │  │ /ready   │  │ /live    │  │ /metrics │  │/deep │
              │  (basic)  │  │  (k8s)   │  │  (k8s)   │  │(Prometheus)│ │health  │
              └───────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

#### 2.1.2 Endpoint Definitions

| Endpoint | Purpose | Expected Response | Failure Action |
|----------|---------|-------------------|----------------|
| `GET /health` | Basic liveness | `200 OK` with version | Load balancer removes instance |
| `GET /health/ready` | Dependency readiness | `200 OK` when DB, cache, queues reachable | Kubernetes holds traffic |
| `GET /health/live` | Process liveness | `200 OK` if process running | Kubernetes restarts pod |
| `GET /health/deep` | Comprehensive check | `200 OK` with all subsystem statuses | Trigger warning alert |
| `GET /metrics` | Prometheus metrics | Text format metrics | No auto-action |

#### 2.1.3 Deep Health Check Components

The deep health check validates all critical dependencies:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-21T08:30:00Z",
  "version": "2.14.3",
  "environment": "production",
  "checks": {
    "postgresql": {
      "status": "healthy",
      "response_time_ms": 12,
      "connection_pool": {
        "active": 8,
        "idle": 12,
        "max": 50
      }
    },
    "redis": {
      "status": "healthy",
      "response_time_ms": 3,
      "memory_used_percent": 45.2
    },
    "elasticsearch": {
      "status": "healthy",
      "cluster_status": "green",
      "active_shards_percent": 100.0
    },
    "celery_workers": {
      "status": "healthy",
      "active_workers": 12,
      "expected_workers": 12
    },
    "gpu_nodes": {
      "status": "healthy",
      "available_gpus": 8,
      "total_gpus": 8,
      "utilization_avg": 34.5
    },
    "s3_storage": {
      "status": "healthy",
      "response_time_ms": 45,
      "buckets_accessible": ["deepsynaps-mri", "deepsynaps-qeeg", "deepsynaps-reports"]
    },
    "external_apis": {
      "pubmed": {"status": "healthy", "latency_ms": 234},
      "crossref": {"status": "healthy", "latency_ms": 189},
      "openai": {"status": "healthy", "latency_ms": 456}
    }
  }
}
```

#### 2.1.4 Uptime Monitoring Configuration

| Monitor Type | Frequency | Timeout | Retry | Locations |
|-------------|-----------|---------|-------|-----------|
| Basic HTTP | 30 seconds | 10s | 2 retries | 10 global locations |
| SSL Expiry | Daily | 30s | 1 retry | Primary region |
| Deep Health | 60 seconds | 15s | 1 retry | 5 global locations |
| API Latency | Every 10s | 5s | 0 retries | 3 edge locations |

#### 2.1.5 Synthetic Transaction Monitoring

Critical user journeys are monitored via synthetic tests:

```python
# Synthetic monitoring script example
SCENARIOS = [
    {
        "name": "Clinic Login → Patient List",
        "steps": [
            {"action": "POST", "url": "/api/v1/auth/login", "assert": "status == 200"},
            {"action": "GET", "url": "/api/v1/patients", "assert": "response_time < 500ms"},
            {"action": "GET", "url": "/api/v1/patients/{id}/scans", "assert": "status == 200"}
        ],
        "frequency": "every_2_minutes",
        "sla_response_time_ms": 2000
    },
    {
        "name": "MRI Upload → Processing Complete",
        "steps": [
            {"action": "POST", "url": "/api/v1/mri/upload", "assert": "status == 202"},
            {"action": "POLL", "url": "/api/v1/mri/{job_id}/status", "until": "completed", "timeout": "10_minutes"},
            {"action": "GET", "url": "/api/v1/mri/{job_id}/report", "assert": "status == 200"}
        ],
        "frequency": "every_15_minutes",
        "sla_response_time_ms": 600000
    },
    {
        "name": "Evidence Search → Results",
        "steps": [
            {"action": "POST", "url": "/api/v1/evidence/search", "body": "{\"query\": \"depression rTMS\"}", "assert": "response_time < 2000ms"},
            {"action": "ASSERT", "condition": "results.count >= 10"}
        ],
        "frequency": "every_5_minutes"
    }
]
```

### 2.2 Database Performance

Database performance directly impacts API response times and user experience. The platform uses PostgreSQL as the primary database, with read replicas for analytics queries.

#### 2.2.1 Connection Monitoring

```yaml
# PostgreSQL connection metrics
database_connections:
  metrics:
    - postgresql_connections_active
    - postgresql_connections_idle
    - postgresql_connections_waiting
    - postgresql_connections_total
    - postgresql_connection_pool_wait_time_ms
    - postgresql_connection_errors_rate
  
  alerts:
    - name: PostgreSQLConnectionPoolExhausted
      condition: postgresql_connections_active / postgresql_connections_max > 0.85
      severity: critical
      for: 2m
      
    - name: PostgreSQLConnectionsWaiting
      condition: postgresql_connections_waiting > 20
      severity: warning
      for: 3m
      
    - name: PostgreSQLConnectionErrorsSpike
      condition: rate(postgresql_connection_errors[5m]) > 10
      severity: critical
      for: 1m
```

#### 2.2.2 Query Performance

| Metric | Collection Method | Threshold Critical | Threshold Warning |
|--------|------------------|-------------------|-------------------|
| Average query time | pg_stat_statements | > 500ms | > 200ms |
| P99 query time | pg_stat_statements | > 2000ms | > 1000ms |
| Slow queries/min | pg_stat_activity | > 50 | > 20 |
| Queries canceled | pg_stat_database | > 10/min | > 5/min |
| Checkpoint frequency | pg_stat_bgwriter | > 1/min | > 1/5min |
| Vacuum lag | pg_stat_user_tables | > 1GB dead tuples | > 500MB |

#### 2.2.3 Lock Monitoring

```sql
-- Lock contention monitoring query
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS blocking_statement,
    blocked_activity.application_name AS blocked_app,
    blocked_activity.wait_event_type,
    blocked_activity.wait_event,
    NOW() - blocked_activity.query_start AS blocked_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity 
    ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.relation = blocked_locks.relation
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity 
    ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

| Lock Alert | Condition | Severity |
|-----------|-----------|----------|
| Deadlock detected | `pg_stat_database.deadlocks` increasing | Critical |
| Long-running lock | Lock held > 30 seconds | Warning |
| Lock queue depth | > 10 waiting locks | Critical |
| Exclusive lock on critical table | Lock on `patients`, `scans` tables > 10s | Critical |

#### 2.2.4 Replication Lag

For read replicas and standby instances:

| Metric | Critical Threshold | Warning Threshold |
|--------|-------------------|-------------------|
| Replication lag (bytes) | > 1GB | > 500MB |
| Replication lag (time) | > 60 seconds | > 30 seconds |
| Replica queries canceled | > 50/min | > 20/min |
| WAL segments pending | > 100 | > 50 |

### 2.3 Storage Usage & Growth

Healthcare data storage grows rapidly, especially with MRI DICOM files and high-density qEEG recordings.

#### 2.3.1 Storage Classification

```
Storage Tier Structure:

┌─────────────────────────────────────────────────────────────┐
│  HOT TIER (SSD) — Active cases, last 90 days                │
│  ├── PostgreSQL primary data                                │
│  ├── Redis cache                                            │
│  ├── Active MRI/NIfTI files (S3 Standard)                   │
│  └── Active qEEG recordings (S3 Standard)                   │
├─────────────────────────────────────────────────────────────┤
│  WARM TIER — Cases 90 days to 2 years                       │
│  ├── Archived DICOM files (S3 Intelligent-Tiering)          │
│  ├── Processed analysis results                             │
│  └── Search index segments                                  │
├─────────────────────────────────────────────────────────────┤
│  COLD TIER — Cases > 2 years, regulatory retention          │
│  ├── Glacier Deep Archive (7-year retention)                │
│  ├── Compliance snapshots                                   │
│  └── Audit logs                                             │
├─────────────────────────────────────────────────────────────┤
│  BACKUP TIER — Disaster recovery                            │
│  ├── Cross-region S3 replication                            │
│  ├── RDS automated snapshots                                │
│  └── EBS snapshots for compute instances                    │
└─────────────────────────────────────────────────────────────┘
```

#### 2.3.2 Storage Metrics

| Metric | Measurement | Alert Threshold |
|--------|-------------|-----------------|
| S3 bucket size | CloudWatch/MinIO metrics | > 80% of provisioned |
| S3 object count | Daily aggregation | > 100M objects per bucket |
| Growth rate | Week-over-week % | > 30% WoW growth |
| PostgreSQL table size | pg_total_relation_size | > 100GB for any table |
| PostgreSQL index bloat | pgstattuple extension | > 30% bloat ratio |
| Elasticsearch index size | `_cat/indices` API | > 50GB per shard |
| EBS volume utilization | CloudWatch | > 85% for 2 hours |
| Backup storage | AWS Backup reports | > 200% of primary storage |

#### 2.3.3 Growth Prediction

```python
# Storage growth prediction model
STORAGE_GROWTH_MODEL = {
    "data_sources": {
        "mri_dicom_per_scan_mb": 150,           # Average DICOM series
        "mri_nifti_per_scan_mb": 25,            # Converted NIfTI
        "mri_processed_output_mb": 45,          # AI analysis output
        "qeeg_raw_per_recording_mb": 80,        # Raw EEG data
        "qeeg_processed_per_recording_mb": 15,  # Processed features
        "report_pdf_kb": 250,                   # Generated report
        "patient_record_kb": 50,                # Metadata per patient
        "evidence_paper_indexed_kb": 200,       # Per indexed paper
    },
    "growth_assumptions": {
        "new_patients_per_month": 5000,
        "scans_per_patient": 1.8,
        "qeeg_recordings_per_patient": 2.1,
        "papers_ingested_per_month": 15000,
        "retention_years": 7,                   # HIPAA requirement
    },
    "prediction_alerts": {
        "30_day_capacity": {"critical": 90, "warning": 75},  # percent
        "90_day_capacity": {"critical": 95, "warning": 80},
        "1_year_capacity": {"critical": 98, "warning": 85}
    }
}
```

#### 2.3.4 Storage Optimization Alerts

| Alert Name | Condition | Action |
|-----------|-----------|--------|
| OrphanedFilesDetected | Files in S3 with no DB reference > 1000 | Run cleanup job, notify |
| CompressionOpportunity | Uncompressed DICOM > 30 days old > 100GB | Trigger compression batch |
| IndexBloatDetected | Bloat > 30% on tables > 10GB | Schedule REINDEX |
| UnusedIndexSpace | Index scan ratio < 0.1 for 7 days | Review for removal |
| ColdDataNotTiered | Data > 90 days still in hot tier > 500GB | Trigger lifecycle policy |

### 2.4 Network Latency

Network performance affects API responsiveness, inter-service communication, and external API integrations.

#### 2.4.1 Latency Monitoring Points

```
Latency Measurement Architecture:

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Client     │────────▶│   Edge CDN   │────────▶│  API Gateway │
│  (Clinic)    │  <50ms  │ (Cloudflare) │  <10ms  │    (Kong)    │
└──────────────┘         └──────────────┘         └──────┬───────┘
                                                         │
    ┌────────────────────────────────────────────────────┼────────────────────┐
    │                                                    │                    │
┌───▼────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────▼────┐  ┌──────────┐
│ Auth   │  │ Patient│  │ MRI    │  │ qEEG   │  │ Evidence  │  │ Billing  │
│Service │  │Service │  │Service │  │Service │  │ Service   │  │ Service  │
│  <5ms  │  │  <10ms │  │  <20ms │  │  <15ms │  │   <25ms   │  │  <10ms   │
└────────┘  └────────┘  └────┬───┘  └────────┘  └───────────┘  └──────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
               ┌────▼───┐ ┌──▼────┐ ┌──▼────┐
               │ GPU    │ │Queue  │ │Storage│
               │Cluster │ │Worker │ │ (S3)  │
               │ <50ms  │ │ <5ms  │ │<100ms │
               └────────┘ └───────┘ └───────┘
```

#### 2.4.2 Latency SLOs

| Path | P50 Target | P95 Target | P99 Target | Measurement |
|------|-----------|-----------|-----------|-------------|
| Client → Edge | 30ms | 80ms | 150ms | Pingdom |
| Edge → API Gateway | 5ms | 15ms | 30ms | Internal metrics |
| API → Auth Service | 3ms | 10ms | 25ms | Distributed tracing |
| API → Patient Service | 8ms | 25ms | 50ms | Distributed tracing |
| API → MRI Service | 15ms | 40ms | 100ms | Distributed tracing |
| API → qEEG Service | 10ms | 30ms | 75ms | Distributed tracing |
| API → Evidence Search | 50ms | 200ms | 500ms | Distributed tracing |
| API → External (PubMed) | 200ms | 500ms | 2000ms | HTTP client metrics |
| Inter-AZ latency | 1ms | 2ms | 5ms | Network metrics |
| Inter-region latency | 50ms | 80ms | 150ms | Network metrics |

#### 2.4.3 Network Metrics

```yaml
network_metrics:
  tcp:
    - tcp_connections_established
    - tcp_connections_time_wait
    - tcp_retransmits_rate
    - tcp_syn_backlog
    - tcp_orphaned_sockets
    
  http:
    - http_requests_total
    - http_request_duration_seconds (histogram)
    - http_requests_in_flight
    - http_response_size_bytes
    
  dns:
    - dns_lookup_duration_seconds
    - dns_lookup_failures_total
    - dns_cache_hit_ratio
    
  tls:
    - tls_handshake_duration_seconds
    - tls_certificate_expiry_timestamp
    - tls_version_negotiated
```

### 2.5 SSL Certificate Monitoring

SSL certificate failures cause immediate service unavailability and browser security warnings.

#### 2.5.1 Certificate Inventory

| Domain | Certificate Type | Issuer | Auto-Renewal | Expiry Alert Days |
|--------|-----------------|--------|-------------|-------------------|
| api.deepsynaps.io | Let's Encrypt | ACME v2 | Yes (cert-manager) | 30, 14, 7, 1 |
| app.deepsynaps.io | Let's Encrypt | ACME v2 | Yes (cert-manager) | 30, 14, 7, 1 |
| cdn.deepsynaps.io | Cloudflare Origin | Cloudflare | Yes | 30, 14, 7 |
| *.clinic.deepsynaps.io | Let's Encrypt Wildcard | ACME v2 | Yes | 30, 14, 7, 1 |
| deepsynaps.io (root) | Let's Encrypt | ACME v2 | Yes | 30, 14, 7, 1 |
| evidence-api.deepsynaps.io | Let's Encrypt | ACME v2 | Yes | 30, 14, 7, 1 |
| mri-upload.deepsynaps.io | Let's Encrypt | ACME v2 | Yes | 30, 14, 7, 1 |
| ws.deepsynaps.io (WebSocket) | Let's Encrypt | ACME v2 | Yes | 30, 14, 7, 1 |

#### 2.5.2 SSL Monitoring Configuration

```yaml
ssl_monitoring:
  probes:
    frequency: "hourly"
    check_points:
      - certificate_valid
      - certificate_chain_complete
      - certificate_not_expired
      - hostname_matches
      - tls_version_acceptable (>= 1.2)
      - cipher_suite_secure
      - ocsp_stapling_enabled
      - certificate_transparency_logged
      
  alerts:
    - name: SSLCertificateExpiringSoon
      condition: expiry_days < 14
      severity: warning
      
    - name: SSLCertificateExpiringCritical
      condition: expiry_days < 7
      severity: critical
      
    - name: SSLCertificateInvalid
      condition: certificate_valid == false
      severity: critical
      immediate: true
      
    - name: SSLTLSVersionTooOld
      condition: tls_version < 1.2
      severity: critical
      
    - name: SSLCipherInsecure
      condition: cipher_suite in INSECURE_CIPHERS
      severity: warning
```

#### 2.5.3 Certificate Metrics

```promql
# Certificate expiry alert rule
group: ssl_certificate
rules:
  - record: ssl:certificate_expiry_days
    expr: |
      (ssl_certificate_not_after - time()) / 86400
      
  - alert: SSLCertificateExpiringIn14Days
    expr: ssl:certificate_expiry_days < 14
    for: 1h
    labels:
      severity: warning
    annotations:
      summary: "SSL certificate for {{ $labels.instance }} expiring in {{ $value }} days"
      runbook_url: "https://wiki.deepsynaps.io/runbooks/ssl-renewal"
      
  - alert: SSLCertificateExpiringIn7Days
    expr: ssl:certificate_expiry_days < 7
    for: 30m
    labels:
      severity: critical
    annotations:
      summary: "SSL certificate for {{ $labels.instance }} expiring in {{ $value }} days - URGENT"
      runbook_url: "https://wiki.deepsynaps.io/runbooks/ssl-renewal"
```

### 2.6 DNS Monitoring

DNS issues can cause complete service unavailability even when all infrastructure is healthy.

#### 2.6.1 DNS Configuration Monitoring

| Record Type | Name | Target | TTL | Monitoring |
|------------|------|--------|-----|-----------|
| A | api.deepsynaps.io | ALB endpoint | 300 | Resolution + IP match |
| A | app.deepsynaps.io | Cloudflare | 300 | CDN response |
| CNAME | cdn.deepsynaps.io | cloudflare.cdn.com | 300 | Resolution chain |
| CNAME | *.clinic.deepsynaps.io | clinic-lb.deepsynaps.io | 300 | Wildcard resolution |
| MX | deepsynaps.io | Google Workspace | 3600 | Deliverability test |
| TXT | deepsynaps.io | SPF, DKIM, DMARC | 3600 | Validation |
| NS | deepsynaps.io | Route 53 | 172800 | Delegation check |
| SOA | deepsynaps.io | Route 53 primary | 900 | Serial sync |

#### 2.6.2 DNS Metrics

```yaml
dns_monitoring:
  checks:
    - name: DNSResolutionTime
      type: external
      command: "dig +stats api.deepsynaps.io"
      threshold_ms: 100
      
    - name: DNSRecordConsistency
      type: external
      command: "check_dns_consistency.sh"
      expected: "all_resolvers_match"
      resolvers:
        - 8.8.8.8          # Google
        - 1.1.1.1          # Cloudflare
        - 9.9.9.9          # Quad9
        - 208.67.222.222   # OpenDNS
        
    - name: DNSTTLPropagation
      type: external
      verify: "actual_ttl <= expected_ttl * 1.2"
      
    - name: DNSSECValidation
      type: external
      verify: "dnssec_chain_valid"
      
  alerts:
    - name: DNSResolutionSlow
      condition: dns_query_duration_seconds > 0.5
      severity: warning
      
    - name: DNSResolutionFailure
      condition: dns_query_success == 0
      severity: critical
      
    - name: DNSRecordMismatch
      condition: dns_record_consistent == 0
      severity: critical
      
    - name: DNSUnexpectedChange
      condition: md5(dns_response) != expected_hash
      severity: critical
```

#### 2.6.3 DNS Propagation Tracking

```python
DNS_PROPAGATION_CHECK = {
    "global_check_points": [
        {"location": "US-East", "resolver": "8.8.8.8"},
        {"location": "US-West", "resolver": "8.8.4.4"},
        {"location": "EU-Central", "resolver": "1.1.1.1"},
        {"location": "EU-West", "resolver": "9.9.9.9"},
        {"location": "APAC", "resolver": "1.1.1.1"},
        {"location": "South-America", "resolver": "8.8.8.8"},
    ],
    "check_frequency_after_change": "every_30_seconds",
    "propagation_timeout": "600_seconds",
    "alert_if_not_propagated_to_all": "300_seconds"
}
```



---

## 3. Queue & Worker Health

The DeepSynaps platform processes thousands of background jobs per hour: MRI analysis, qEEG processing, evidence indexing, report generation, data exports, and notification delivery. Queue health is critical to clinical operations.

### 3.1 Background Job Queues

The platform uses a multi-queue architecture to isolate workloads by priority, resource requirements, and failure domains.

#### 3.1.1 Queue Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Redis/RabbitMQ Cluster                        │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  CRITICAL QUEUE  │  │  DEFAULT QUEUE   │  │   BATCH QUEUE    │ │
│  │  (mri_analysis)  │  │  (notifications, │  │  (evidence_sync, │ │
│  │  (qeeg_process)  │  │   report_gen)    │  │   data_export)   │ │
│  │  (patient_alert) │  │                  │  │                  │ │
│  │  max_priority:10 │  │  max_priority:5  │  │  max_priority:1  │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
│           │                     │                     │           │
│  ┌────────▼─────────┐  ┌────────▼─────────┐  ┌────────▼─────────┐ │
│  │ CRITICAL WORKERS │  │ DEFAULT WORKERS  │  │  BATCH WORKERS   │ │
│  │  (GPU-enabled)   │  │  (CPU-heavy)     │  │  (CPU-light)     │ │
│  │  min: 4 max: 20  │  │  min: 2 max: 10  │  │  min: 1 max: 5   │ │
│  │  concurrency: 2  │  │  concurrency: 8  │  │  concurrency: 4  │ │
│  │  prefetch: 1     │  │  prefetch: 4     │  │  prefetch: 8     │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    DEAD LETTER QUEUES                                │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  DLQ_CRITICAL    │  │   DLQ_DEFAULT    │  │    DLQ_BATCH     │ │
│  │  (max_retries:3) │  │  (max_retries:5) │  │  (max_retries:5) │ │
│  │  retention: 30d  │  │  retention: 14d  │  │  retention: 7d   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘ │
│           │                     │                     │           │
│           └─────────────────────┼─────────────────────┘           │
│                                 ▼                                   │
│                    ┌─────────────────────┐                          │
│                    │   DLQ Processor     │                          │
│                    │  (manual review UI) │                          │
│                    │  (auto-retry logic) │                          │
│                    └─────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.1.2 Queue Definitions

| Queue Name | Purpose | Priority | Worker Type | Max Runtime | SLA |
|-----------|---------|----------|-------------|-------------|-----|
| `mri.analysis` | MRI scan processing (segmentation, biomarker extraction) | 10 | GPU workers | 30 min | 95% < 20 min |
| `qeeg.process` | qEEG artifact cleaning, spectral analysis | 9 | GPU/CPU workers | 15 min | 95% < 10 min |
| `report.generate` | Clinical report generation | 8 | CPU workers | 5 min | 99% < 2 min |
| `patient.alert` | Critical patient notifications | 10 | CPU workers | 30 sec | 99.9% < 10 sec |
| `evidence.sync` | Paper ingestion, citation updates | 3 | CPU workers | 2 hours | 90% < 1 hour |
| `data.export` | Clinic data exports | 2 | CPU workers | 1 hour | 95% < 30 min |
| `notification.email` | Email notifications | 4 | CPU workers | 1 min | 99% < 30 sec |
| `notification.sms` | SMS notifications | 6 | CPU workers | 30 sec | 99.9% < 15 sec |
| `search.reindex` | Elasticsearch reindexing | 1 | CPU workers | 4 hours | Best effort |
| `backup.verify` | Backup integrity checks | 1 | CPU workers | 2 hours | Best effort |

#### 3.1.3 Worker Configuration

```python
WORKER_CONFIGURATIONS = {
    "gpu_worker_mri": {
        "queue": "mri.analysis",
        "concurrency": 2,              # 2 concurrent MRI jobs per GPU
        "prefetch_multiplier": 1,      # Don't prefetch - long jobs
        "worker_prefetch_multiplier": 1,
        "task_acks_late": True,        # Ack only after completion
        "task_reject_on_worker_lost": True,
        "task_time_limit": 1800,       # 30 minutes
        "task_soft_time_limit": 1500,  # 25 minutes (graceful shutdown)
        "max_tasks_per_child": 50,     # Restart worker after 50 tasks
        "pool": "solo",                # One process - GPU memory
        "hardware_requirements": {
            "gpu": "NVIDIA A100 40GB",
            "cpu_cores": 8,
            "ram_gb": 64,
            "disk_gb": 200
        }
    },
    "gpu_worker_qeeg": {
        "queue": "qeeg.process",
        "concurrency": 4,
        "prefetch_multiplier": 2,
        "task_acks_late": True,
        "task_time_limit": 900,        # 15 minutes
        "task_soft_time_limit": 780,   # 13 minutes
        "max_tasks_per_child": 100,
        "pool": "prefork",
        "hardware_requirements": {
            "gpu": "NVIDIA T4 16GB",
            "cpu_cores": 4,
            "ram_gb": 32,
            "disk_gb": 100
        }
    },
    "cpu_worker_default": {
        "queue": "default",
        "concurrency": 8,
        "prefetch_multiplier": 4,
        "task_acks_late": False,
        "task_time_limit": 300,
        "task_soft_time_limit": 240,
        "max_tasks_per_child": 1000,
        "pool": "prefork",
        "hardware_requirements": {
            "cpu_cores": 4,
            "ram_gb": 16,
            "disk_gb": 50
        }
    }
}
```

### 3.2 Job Success/Failure Rates

Job success rates are a primary indicator of system health. Clinical processing jobs require especially high reliability.

#### 3.2.1 Success Rate SLOs

| Queue Category | Target Success Rate | Critical Threshold | Warning Threshold |
|---------------|-------------------|-------------------|-------------------|
| Critical (MRI, qEEG, alerts) | > 99.9% | < 99.5% | < 99.9% |
| Default (reports, notifications) | > 99.5% | < 99.0% | < 99.5% |
| Batch (sync, export, reindex) | > 98.0% | < 95.0% | < 98.0% |
| Overall platform | > 99.5% | < 99.0% | < 99.5% |

#### 3.2.2 Failure Classification

| Failure Type | Description | Retry Strategy | Alert |
|-------------|-------------|----------------|-------|
| `TRANSIENT` | Temporary issue (network, lock) | Exponential backoff, 3-5 retries | Warning after 3 failures |
| `RESOURCE` | Insufficient resources (OOM, GPU) | Delayed retry with resource check | Warning, scale if pattern |
| `TIMEOUT` | Task exceeded time limit | No retry, alert operator | Critical immediately |
| `VALIDATION` | Invalid input data | No retry, dead letter queue | Warning per job |
| `BUG` | Unexpected exception | No retry, dead letter queue | Critical immediately |
| `DEPENDENCY` | External service failure | Backoff retry, circuit breaker | Warning, escalate if persists |

#### 3.2.3 Failure Metrics

```promql
# Job success rate by queue
sum(rate(celery_task_succeeded_total[5m])) by (queue_name)
/
sum(rate(celery_task_total[5m])) by (queue_name)

# Job failure rate by error type
sum(rate(celery_task_failed_total[5m])) by (queue_name, exception_type)

# Job retry rate
sum(rate(celery_task_retried_total[5m])) by (queue_name)
/
sum(rate(celery_task_total[5m])) by (queue_name)

# Average job duration by task type
histogram_quantile(0.95,
  sum(rate(celery_task_duration_seconds_bucket[5m])) by (task_name, le)
)
```

#### 3.2.4 Failure Dashboard Metrics

| Metric | Visualization | Drill-Down |
|--------|--------------|------------|
| Success rate trend (24h) | Line chart | By queue, by task type |
| Failure rate by exception | Stacked bar | Stack trace, affected jobs |
| Retry distribution | Histogram | By task, by retry count |
| Failed job table | Sortable table | Job details, logs, traceback |
| Failure correlation | Heatmap | Time vs. exception type |

### 3.3 Queue Depth & Lag

Queue depth indicates system capacity. Growing queues signal insufficient worker capacity or upstream bottlenecks.

#### 3.3.1 Queue Depth Thresholds

| Queue | Normal Depth | Warning Depth | Critical Depth | Max Acceptable Lag |
|-------|-------------|---------------|----------------|-------------------|
| `mri.analysis` | 0-5 | 10 | 25 | 15 minutes |
| `qeeg.process` | 0-10 | 20 | 50 | 10 minutes |
| `report.generate` | 0-20 | 50 | 200 | 5 minutes |
| `patient.alert` | 0 | 5 | 20 | 30 seconds |
| `evidence.sync` | 0-100 | 500 | 2000 | 2 hours |
| `data.export` | 0-10 | 30 | 100 | 1 hour |
| `notification.email` | 0-50 | 200 | 1000 | 10 minutes |
| `notification.sms` | 0-10 | 50 | 200 | 2 minutes |

#### 3.3.2 Queue Lag Calculation

```python
QUEUE_LAG_METRICS = {
    "oldest_unacked_job_age": {
        "description": "Age of the oldest job not yet acknowledged by a worker",
        "calculation": "NOW() - MIN(job.enqueued_at WHERE job.status = 'pending')",
        "alert_thresholds": {
            "mri.analysis": {"warning": 300, "critical": 600},      # seconds
            "qeeg.process": {"warning": 180, "critical": 360},
            "patient.alert": {"warning": 15, "critical": 30},
            "report.generate": {"warning": 120, "critical": 300},
        }
    },
    "consumer_lag": {
        "description": "Number of messages not yet delivered to consumers",
        "calculation": "queue.message_count - sum(worker.in_flight)",
        "alert_thresholds": {
            "mri.analysis": {"warning": 10, "critical": 25},
            "qeeg.process": {"warning": 20, "critical": 50},
            "patient.alert": {"warning": 5, "critical": 20},
        }
    },
    "processing_rate_vs_ingress": {
        "description": "Whether workers are keeping up with job submission",
        "calculation": "rate(jobs_completed) - rate(jobs_enqueued)",
        "alert_when": "negative for > 5 minutes",
        "severity": "warning"
    }
}
```

#### 3.3.3 Auto-Scaling Based on Queue Depth

```yaml
queue_autoscaling:
  mri_analysis_workers:
    metric: "queue_depth_mri_analysis"
    scale_up:
      - threshold: 10
        add_workers: 2
      - threshold: 25
        add_workers: 5
      - threshold: 50
        add_workers: 10
        alert: "critical_capacity"
    scale_down:
      - threshold: 3
        remove_workers: 1
        cooldown: "5m"
    max_workers: 20
    min_workers: 4
    scale_up_cooldown: "2m"
    
  qeeg_processing_workers:
    metric: "queue_depth_qeeg_process"
    scale_up:
      - threshold: 20
        add_workers: 2
      - threshold: 50
        add_workers: 5
    scale_down:
      - threshold: 5
        remove_workers: 1
        cooldown: "5m"
    max_workers: 15
    min_workers: 2
```

### 3.4 Worker Availability

Worker availability ensures there are sufficient resources to process jobs.

#### 3.4.1 Worker Health Checks

| Check | Frequency | Failure Action |
|-------|-----------|----------------|
| Process heartbeat | Every 10 seconds | Mark worker offline after 30s |
| Memory usage | Every 30 seconds | Restart if > 90% |
| GPU availability (GPU workers) | Every 30 seconds | Evacuate to new worker |
| Disk space | Every 60 seconds | Alert, prevent new tasks |
| Task processing rate | Every 5 minutes | Alert if rate drops to 0 |
| Worker connectivity to queue | Every 10 seconds | Restart if disconnected > 60s |

#### 3.4.2 Worker Metrics

```promql
# Active workers by queue
celery_worker_up{queue=~"mri.analysis|qeeg.process"}

# Worker task processing rate
rate(celery_task_completed_total[5m]) / celery_worker_up

# Worker memory usage
celery_worker_memory_bytes / celery_worker_memory_limit_bytes

# GPU utilization per worker
nvidia_gpu_utilization_gpu{job="gpu-workers"}

# Time since last heartbeat
time() - celery_worker_last_heartbeat_timestamp

# Workers below minimum threshold
celery_worker_up < celery_worker_min_desired
```

#### 3.4.3 Worker Availability SLOs

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Critical queue workers online | 100% of minimum | < 100% of minimum |
| Default queue workers online | > 90% of desired | < 75% of desired |
| GPU workers available | > 80% of pool | < 60% of pool |
| Worker restart frequency | < 2 per hour | > 5 per hour |
| Mean time to worker recovery | < 2 minutes | > 5 minutes |

### 3.5 Retry Handling

Sophisticated retry handling prevents transient failures from affecting clinical operations.

#### 3.5.1 Retry Configuration

```python
RETRY_POLICIES = {
    "mri_analysis": {
        "max_retries": 3,
        "backoff_strategy": "exponential",
        "initial_delay": 60,           # 1 minute
        "max_delay": 600,              # 10 minutes
        "exponential_base": 2,
        "jitter": "full",              # Add random jitter
        "retry_on_exceptions": [
            "TransientNetworkError",
            "GPUOutOfMemoryError",
            "StorageTemporarilyUnavailable",
            "LockTimeoutError"
        ],
        "dont_retry_on": [
            "ValidationError",
            "CorruptDICOMError",
            "UnsupportedSequenceError",
            "PermissionDeniedError"
        ]
    },
    "qeeg_processing": {
        "max_retries": 3,
        "backoff_strategy": "exponential",
        "initial_delay": 30,
        "max_delay": 300,
        "exponential_base": 2,
        "jitter": "equal",
        "retry_on_exceptions": [
            "TransientNetworkError",
            "MemoryPressureError",
            "TemporalArtifactTooSevere"   # Retry with different params
        ]
    },
    "report_generation": {
        "max_retries": 2,
        "backoff_strategy": "fixed",
        "delay": 30,
        "jitter": "none",
        "retry_on_exceptions": [
            "TemplateRenderError",
            "ImageNotFoundError"
        ]
    },
    "evidence_sync": {
        "max_retries": 5,
        "backoff_strategy": "exponential",
        "initial_delay": 300,          # 5 minutes
        "max_delay": 3600,             # 1 hour
        "exponential_base": 2,
        "jitter": "decorrelated",
        "retry_on_exceptions": [
            "ExternalAPIRateLimit",
            "ExternalAPITimeout",
            "NetworkPartitionError"
        ]
    }
}
```

#### 3.5.2 Retry Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `retries_per_job_avg` | Average retries before success/failure | > 1.5 |
| `retry_success_rate` | % of retries that eventually succeed | < 70% |
| `max_retries_exceeded_rate` | % of jobs that exhaust all retries | > 0.1% for critical |
| `retry_latency_p99` | Time from first attempt to final success | > 30 min for critical |
| `retry_storm_detected` | Sudden spike in retries across queue | > 5x baseline |

### 3.6 Dead Letter Queues

Dead letter queues (DLQs) capture jobs that have exhausted retries, enabling manual inspection and reprocessing.

#### 3.6.1 DLQ Architecture

```
Job Flow:

┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Enqueued │───▶│ Attempt 1│───▶│ Attempt 2│───▶│ Attempt 3│
└──────────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
                     │               │               │
                     ▼               ▼               ▼
               ┌──────────┐   ┌──────────┐   ┌──────────┐
               │ Success  │   │ Success  │   │ Fail/Max │
               │  (done)  │   │  (done)  │   │ Retries  │
               └──────────┘   └──────────┘   └────┬─────┘
                                                   │
                                                   ▼
                                           ┌──────────────┐
                                           │ Dead Letter  │
                                           │    Queue     │
                                           └──────┬───────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              │                   │                   │
                              ▼                   ▼                   ▼
                        ┌──────────┐      ┌──────────┐      ┌──────────┐
                        │  Manual  │      │  Auto    │      │  Archive │
                        │ Review   │      │  Retry   │      │  (30d)   │
                        │   UI     │      │  (daily) │      │          │
                        └──────────┘      └──────────┘      └──────────┘
```

#### 3.6.2 DLQ Processing

```python
DLQ_PROCESSOR_CONFIG = {
    "review_ui": {
        "enabled": True,
        "url": "/ops/dlq/review",
        "fields_displayed": [
            "task_id", "task_name", "queue", "original_payload_summary",
            "error_type", "error_message", "traceback_preview",
            "attempt_count", "first_attempt_at", "last_failure_at",
            "clinic_id", "patient_id_anonymized", "affected_job_type"
        ],
        "actions_available": [
            "retry_job",          # Retry with same parameters
            "retry_with_params",  # Allow parameter modification
            "discard_job",        # Acknowledge and remove
            "escalate",           # Create incident ticket
            "bulk_retry",         # Retry all matching jobs
            "bulk_discard"        # Discard all matching jobs
        ],
        "access_control": ["platform_ops", "clinical_ops_lead"]
    },
    "auto_retry": {
        "enabled": True,
        "schedule": "0 */6 * * *",  # Every 6 hours
        "conditions": {
            "error_type_is_transient": True,
            "external_dependency_healthy": True,
            "queue_depth_low": True,      # Don't add load to struggling queue
            "max_auto_retries_per_run": 100
        }
    },
    "archival": {
        "retention_days": 30,
        "export_to_s3_before_delete": True,
        "s3_bucket": "deepsynaps-dlq-archive"
    }
}
```

#### 3.6.3 DLQ Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| DLQ depth | Current messages in DLQ | > 100 critical, > 20 warning |
| DLQ ingress rate | Messages entering DLQ per hour | > 50/hour critical |
| DLQ oldest message | Age of oldest unprocessed message | > 24 hours |
| DLQ resolution rate | % of DLQ messages resolved (retry/discard) | < 80% per day |
| DLQ by error type | Breakdown of why jobs failed | Top 3 error types |
| DLQ by clinic | Which clinics are affected | Any clinic > 10 jobs/day |

---

## 4. AI/ML Pipeline Monitoring

The DeepSynaps platform relies on multiple AI/ML models: MRI segmentation, brain age estimation, qEEG biomarker extraction, clinical prediction, and evidence synthesis. ML pipeline monitoring ensures model reliability, performance, and safety.

### 4.1 Inference Request Volume

Understanding inference patterns enables capacity planning and cost optimization.

#### 4.1.1 Inference Volume Metrics

```promql
# Total inference requests by model
sum(rate(inference_requests_total[5m])) by (model_name, model_version)

# Inference requests by clinic
sum(rate(inference_requests_total[1h])) by (clinic_id)

# Inference requests by endpoint
sum(rate(inference_requests_total[5m])) by (api_endpoint)

# Request volume trend (hour-over-hour)
sum(rate(inference_requests_total[1h]))
/ 
sum(rate(inference_requests_total[1h] offset 1h))

# Batch vs. real-time inference split
sum(rate(inference_requests_total[1h])) by (inference_type)
```

#### 4.1.2 Volume Dashboard

| Panel | Type | Dimensions |
|-------|------|-----------|
| Requests/second (real-time) | Time series | By model |
| Daily request volume | Bar chart | By clinic, by model |
| Peak hours heatmap | Heatmap | Hour x Day of week |
| Request distribution | Histogram | By payload size |
| Clinic usage ranking | Top-N table | By volume, by cost |

#### 4.1.3 Volume Anomaly Detection

```python
VOLUME_ANOMALY_CONFIG = {
    "algorithm": "triple_exponential_smoothing",
    "seasonality_periods": ["1d", "1w"],  # Daily and weekly patterns
    "sensitivity": {
        "critical": 4.0,   # 4 std deviations
        "warning": 2.5     # 2.5 std deviations
    },
    "min_baseline": 100,    # Need 100 requests for meaningful baseline
    "detection_window": "1h",
    "alert_conditions": {
        "spike": "volume > predicted_upper * 1.5",
        "drop": "volume < predicted_lower * 0.5",
        "zero": "volume == 0 for > 5 minutes (during business hours)"
    }
}
```

### 4.2 Model Latency Distribution

Model latency directly impacts clinical workflow. Different percentiles capture different user experiences.

#### 4.2.1 Latency Measurement Architecture

```
Inference Request Flow with Latency Tracking:

Client ──[t0]──▶ API Gateway ──[t1]──▶ Model Router ──[t2]──▶ GPU Queue
                                                          │
                                                          ▼
                                                     ┌──────────┐
                                                     │  GPU     │
                                                     │  Worker  │
                                                     │  [t3]    │
                                                     └────┬─────┘
                                                          │
                                                          ▼
                                                     ┌──────────┐
                                                     │  Model   │
                                                     │ Inference│
                                                     │  [t4]    │
                                                     └────┬─────┘
                                                          │
                                               ┌──────────┼──────────┐
                                               │          │          │
                                               ▼          ▼          ▼
                                           ┌────────┐ ┌────────┐ ┌────────┐
                                           │Preproc │ │ Forward│ │Postproc│
                                           │ [t4a]  │ │ [t4b]  │ │ [t4c]  │
                                           └────────┘ └────────┘ └────────┘
                                                          │
                                               ┌──────────┘
                                               │
                                               ▼
                                         ┌──────────┐
                                         │ Response │
                                         │  [t5]    │
                                         └──────────┘

Latency Segments:
- queue_wait = t3 - t2
- preprocessing = t4a - t3
- inference_forward = t4b - t4a
- postprocessing = t4c - t4b
- total_server_time = t5 - t0
- network_time = t5(client) - t0(client) - (t5 - t0)
```

#### 4.2.2 Latency SLOs by Model

| Model | P50 Target | P95 Target | P99 Target | Max Timeout |
|-------|-----------|-----------|-----------|-------------|
| MRI Segmentation (T1) | 45s | 90s | 120s | 180s |
| MRI Segmentation (T2-FLAIR) | 60s | 120s | 180s | 240s |
| Brain Age Estimation | 30s | 60s | 90s | 120s |
| qEEG Artifact Removal | 15s | 30s | 45s | 60s |
| qEEG Spectral Analysis | 10s | 20s | 30s | 45s |
| qEEG Connectivity Analysis | 20s | 40s | 60s | 90s |
| Biomarker Risk Scoring | 2s | 5s | 10s | 15s |
| Evidence Search Ranking | 200ms | 500ms | 1000ms | 2000ms |
| Clinical Prediction | 500ms | 1000ms | 2000ms | 5000ms |
| Report Generation | 3s | 8s | 15s | 30s |

#### 4.2.3 Latency Metrics

```promql
# P50, P95, P99 latency by model
histogram_quantile(0.50, sum(rate(inference_duration_seconds_bucket[5m])) by (model_name, le))
histogram_quantile(0.95, sum(rate(inference_duration_seconds_bucket[5m])) by (model_name, le))
histogram_quantile(0.99, sum(rate(inference_duration_seconds_bucket[5m])) by (model_name, le))

# Queue wait time by model
histogram_quantile(0.95, sum(rate(inference_queue_wait_seconds_bucket[5m])) by (model_name, le))

# GPU compute time (excluding queue)
histogram_quantile(0.95, sum(rate(inference_gpu_compute_seconds_bucket[5m])) by (model_name, le))

# Latency by input size
histogram_quantile(0.95, 
  sum(rate(inference_duration_seconds_bucket[5m])) by (input_size_bucket, le)
)

# Latency regression detection
inference_duration_seconds:p95_1h / inference_duration_seconds:p95_1h offset 1d > 1.5
```

#### 4.2.4 Latency Alert Rules

```yaml
groups:
  - name: ml_latency_alerts
    interval: 30s
    rules:
      - alert: MRISegmentationLatencyP95High
        expr: |
          histogram_quantile(0.95, 
            sum(rate(inference_duration_seconds_bucket{model="mri_segmentation"}[5m])) by (le)
          ) > 120
        for: 5m
        labels:
          severity: warning
          team: ml-platform
        annotations:
          summary: "MRI segmentation P95 latency > 120s"
          description: "Current P95: {{ $value }}s. Target: 90s"
          runbook_url: "https://wiki.deepsynaps.io/runbooks/ml-latency"
          
      - alert: InferenceLatencyP99Critical
        expr: |
          histogram_quantile(0.99,
            sum(rate(inference_duration_seconds_bucket[5m])) by (model_name, le)
          ) > 2 * ON(model_name) GROUP_LEFT() inference_latency_slo_p99{model_name}
        for: 3m
        labels:
          severity: critical
          team: ml-platform
        annotations:
          summary: "{{ $labels.model_name }} P99 latency 2x over SLO"
          description: "Current P99: {{ $value }}s"
          
      - alert: QueueWaitTimeExcessive
        expr: |
          histogram_quantile(0.95,
            sum(rate(inference_queue_wait_seconds_bucket[5m])) by (model_name, le)
          ) > 300
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.model_name }} queue wait P95 > 5 minutes"
          action: "Consider scaling GPU workers"
```

### 4.3 GPU Utilization

GPU resources represent a significant infrastructure cost. Efficient utilization is critical for both performance and economics.

#### 4.3.1 GPU Metrics Collection

```yaml
gpu_monitoring:
  collection_interval: "15s"
  metrics_source: "nvidia-dcgm-exporter"
  
  metrics:
    # Core GPU metrics
    - dcgm_gpu_utilization              # GPU compute utilization %
    - dcgm_gpu_memory_used_bytes        # VRAM used
    - dcgm_gpu_memory_total_bytes       # VRAM total
    - dcgm_gpu_memory_copy_utilization  # Memory bus utilization %
    - dcgm_gpu_power_usage_watts        # Power consumption
    - dcgm_gpu_temperature_celsius      # GPU temperature
    - dcgm_gpu_clock_freq_mhz           # Clock frequency
    - dcgm_gpu_pcie_tx_bytes            # PCIe transmit
    - dcgm_gpu_pcie_rx_bytes            # PCIe receive
    - dcgm_gpu_xid_errors               # XID error codes
    - dcgm_gpu_nvlink_bandwidth         # NVLink bandwidth (multi-GPU)
    
    # Process-level metrics
    - dcgm_gpu_compute_processes        # Active compute processes
    - dcgm_gpu_memory_processes         # Processes using GPU memory
    
  thresholds:
    temperature:
      warning: 80
      critical: 85
      shutdown: 95
      
    memory:
      warning: 85
      critical: 95
      
    power:
      warning: 350    # watts for A100
      critical: 400
```

#### 4.3.2 GPU Utilization Targets

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| GPU compute utilization (avg) | 70-85% | < 50% (waste) or > 95% | > 98% for 10 min |
| GPU memory utilization | 70-85% | < 40% (waste) or > 90% | > 95% |
| GPU temperature | < 75°C | > 80°C | > 85°C |
| GPU power draw | 250-350W (A100) | > 400W | > 450W |
| GPU error rate (XID) | 0 | > 0 in 1h | > 5 in 1h |
| GPU clock throttling | 0% | > 5% | > 20% |
| MIG instance utilization | 70-85% | < 50% | N/A |

#### 4.3.3 GPU Efficiency Dashboard

| Panel | Type | Purpose |
|-------|------|---------|
| GPU utilization heatmap | Heatmap | Utilization per GPU over time |
| GPU memory usage | Stacked area | Per model, per GPU |
| Power efficiency | Line chart | GFLOPS/watt trend |
| Temperature gauge | Gauge | Current per GPU |
| Queue depth vs. utilization | Dual axis | Capacity correlation |
| GPU cost per inference | Bar chart | Efficiency by model |
| GPU saturation events | Event markers | When utilization hit 100% |

#### 4.3.4 GPU Failure Handling

```python
GPU_FAILURE_HANDLING = {
    "xid_error_codes": {
        "48": {"description": "Double Bit ECC Error", "action": "evacuate_immediately"},
        "74": {"description": "NVLink Error", "action": "disable_nvlink_pair"},
        "79": {"description": "Xid 79 (internal)", "action": "reset_gpu"},
        "95": {"description": "Uncontained ECC Error", "action": "evacuate_immediately"},
        "119": {"description": "GSP RPC Timeout", "action": "reset_gpu"},
    },
    "auto_recovery": {
        "enabled": True,
        "evacuate_tasks": True,
        "node_drain_timeout": 300,     # 5 minutes to finish or move
        "auto_reboot_after_evacuation": True,
        "health_check_after_recovery": "5m"
    },
    "alerts": {
        "gpu_xid_error": {"severity": "critical", "immediate": True},
        "gpu_temperature_high": {"severity": "warning", "for": "2m"},
        "gpu_memory_exhaustion": {"severity": "critical", "for": "1m"},
        "gpu_utilization_zero": {"severity": "warning", "for": "5m"}
    }
}
```

### 4.4 Model Accuracy Drift

Model accuracy drift is a critical concern in healthcare AI. Drift detection ensures models remain clinically valid.

#### 4.4.1 Drift Detection Architecture

```
Model Monitoring Pipeline:

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Production  │────▶│  Feature     │────▶│  Prediction  │
│   Traffic    │     │  Store       │     │  Log (S3)    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              │                   │                   │
                              ▼                   ▼                   ▼
                        ┌──────────┐      ┌──────────┐      ┌──────────┐
                        │  Data    │      │  Model   │      │ Concept  │
                        │  Drift   │      │  Quality │      │  Drift   │
                        │ Detection│      │ Monitor  │      │ Detection│
                        │          │      │          │      │          │
                        │KS/Wasser-│      │Accuracy  │      │ Error    │
                        │stein/JS  │      │ AUC F1  │      │ rate     │
                        │divergence│      │ trend   │      │ trend    │
                        └────┬─────┘      └────┬─────┘      └────┬─────┘
                             │                   │                   │
                             └───────────────────┼───────────────────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐
                                          │  Drift       │
                                          │  Aggregator  │
                                          │              │
                                          │ Composite    │
                                          │ drift score  │
                                          └──────┬───────┘
                                                 │
                              ┌──────────────────┼──────────────────┐
                              │                  │                  │
                              ▼                  ▼                  ▼
                        ┌──────────┐     ┌──────────┐     ┌──────────┐
                        │  Auto    │     │  Alert   │     │  Manual  │
                        │  Retrain │     │  ClinOps │     │  Review  │
                        │  Trigger │     │          │     │  Queue   │
                        └──────────┘     └──────────┘     └──────────┘
```

#### 4.4.2 Drift Detection Configuration

```python
DRIFT_DETECTION_CONFIG = {
    "data_drift": {
        "methods": {
            "numerical_features": {
                "primary": "wasserstein_distance",
                "threshold": 0.1,
                "reference_distribution": "training_set",
                "window": "last_7_days"
            },
            "categorical_features": {
                "primary": "jensen_shannon_divergence",
                "threshold": 0.15,
                "reference_distribution": "training_set",
                "window": "last_7_days"
            },
            "image_features": {
                "primary": "embedding_distance",
                "model": "resnet50_pretrained",
                "threshold": 0.2,
                "reference": "training_embeddings"
            }
        },
        "frequency": "daily",
        "minimum_samples": 100,
        "alert_severity": "warning"
    },
    
    "prediction_drift": {
        "methods": {
            "distribution_shift": {
                "metric": "psi",          # Population Stability Index
                "threshold": 0.2,         # PSI > 0.2 indicates significant shift
                "baseline": "training_predictions"
            },
            "confidence_drift": {
                "metric": "mean_confidence_trend",
                "threshold": "10% decrease",
                "window": "7d vs 7d prior"
            }
        },
        "frequency": "daily",
        "alert_severity": "warning"
    },
    
    "concept_drift": {
        "methods": {
            "accuracy_trend": {
                "requires_ground_truth": True,
                "ground_truth_source": "clinical_outcomes",
                "lag_days": 30,           # Outcomes known after 30 days
                "metric": "auc_roc",
                "degradation_threshold": "5% from baseline"
            },
            "proxy_accuracy": {
                "when_ground_truth_unavailable": True,
                "method": "compare_with_ensemble",
                "disagreement_threshold": "15%"
            }
        },
        "frequency": "weekly",
        "alert_severity": "critical"
    }
}
```

#### 4.4.3 Clinical Model Accuracy SLOs

| Model | Primary Metric | Baseline | Degradation Warning | Degradation Critical |
|-------|---------------|----------|-------------------|---------------------|
| MRI Segmentation (T1) | Dice Score | > 0.92 | < 0.90 | < 0.88 |
| MRI Brain Age | MAE (years) | < 3.5 | > 4.0 | > 5.0 |
| MRI Pathology Detection | AUC-ROC | > 0.95 | < 0.93 | < 0.90 |
| qEEG Artifact Detection | F1 Score | > 0.94 | < 0.92 | < 0.90 |
| qEEG Biomarker Extraction | Correlation with manual | > 0.85 | < 0.80 | < 0.75 |
| Clinical Risk Prediction | AUC-ROC | > 0.88 | < 0.85 | < 0.82 |
| Evidence Relevance Ranking | NDCG@10 | > 0.80 | < 0.75 | < 0.70 |

#### 4.4.4 Drift Alert Examples

```yaml
- alert: MRISegmentationDiceScoreDeclining
  expr: |
    mri_segmentation_dice_score:7d_mean < 0.90
  for: 1d
  labels:
    severity: warning
    team: ml-clinical
  annotations:
    summary: "MRI segmentation accuracy declining"
    description: "7-day mean Dice: {{ $value }}. Baseline: 0.92"
    action: "Review recent scans, check for protocol changes"
    
- alert: ModelConceptDriftCritical
  expr: |
    model_accuracy_auc:30d_rolling < (model_accuracy_baseline - 0.05)
  for: 1d
  labels:
    severity: critical
    team: ml-clinical
  annotations:
    summary: "{{ $labels.model_name }} accuracy degraded > 5%"
    description: "Current AUC: {{ $value }}. Baseline: {{ $labels.baseline }}"
    action: "Escalate to ML team lead, consider model rollback"
    
- alert: FeatureDistributionShiftDetected
  expr: |
    feature_drift_score > 0.2
  for: 1d
  labels:
    severity: warning
  annotations:
    summary: "Feature drift detected in {{ $labels.feature_name }}"
    description: "Drift score: {{ $value }}. Threshold: 0.2"
    action: "Investigate data pipeline, check scanner protocol changes"
```

### 4.5 Input/Output Validation

Input and output validation prevents clinically unsafe predictions from reaching users.

#### 4.5.1 Input Validation Pipeline

```python
INPUT_VALIDATION_PIPELINE = {
    "mri_input": {
        "checks": [
            {
                "name": "file_format",
                "validate": "is_valid_dicom_or_nifti",
                "on_failure": "reject_with_message",
                "severity": "error"
            },
            {
                "name": "scan_parameters",
                "validate": "matches_expected_protocol",
                "parameters": ["TR", "TE", "flip_angle", "slice_thickness", "field_strength"],
                "tolerance": "5%",
                "on_failure": "warn_and_flag",
                "severity": "warning"
            },
            {
                "name": "image_dimensions",
                "validate": "within_expected_range",
                "min_voxels": [64, 64, 32],
                "max_voxels": [512, 512, 512],
                "on_failure": "reject_with_message",
                "severity": "error"
            },
            {
                "name": "image_quality",
                "validate": "not_degenerate",
                "checks": ["non_zero", "non_constant", "reasonable_variance"],
                "on_failure": "reject_with_message",
                "severity": "error"
            },
            {
                "name": "anatomical_coverage",
                "validate": "full_brain_present",
                "method": "template_registration_check",
                "on_failure": "flag_for_manual_review",
                "severity": "warning"
            }
        ],
        "metrics": {
            "validation_pass_rate": "gauge",
            "validation_failures_by_check": "counter",
            "validation_latency": "histogram"
        }
    },
    
    "qeeg_input": {
        "checks": [
            {
                "name": "sampling_rate",
                "validate": ">= 128 Hz",
                "on_failure": "reject_with_message",
                "severity": "error"
            },
            {
                "name": "channel_count",
                "validate": ">= 19 channels (10-20 system)",
                "on_failure": "reject",
                "severity": "error"
            },
            {
                "name": "recording_duration",
                "validate": ">= 2 minutes eyes-closed",
                "on_failure": "warn_and_flag",
                "severity": "warning"
            },
            {
                "name": "impedance_check",
                "validate": "all_channels < 50kOhm",
                "on_failure": "flag_electrodes",
                "severity": "warning"
            },
            {
                "name": "artifact_severity",
                "validate": "usable_segments >= 60%",
                "on_failure": "flag_for_manual_review",
                "severity": "warning"
            }
        ]
    }
}
```

#### 4.5.2 Output Validation (Clinical Safety Checks)

| Validation | Description | Failure Action |
|-----------|-------------|----------------|
| Output range check | Values within clinically plausible ranges | Clamp + flag |
| Anatomical plausibility | Segmented structures have expected volumes | Flag for review |
| Confidence threshold | Model confidence below threshold | Require manual review |
| Agreement with prior | Significant deviation from patient's prior scan | Flag + alert clinician |
| Cross-model consistency | Different models agree on diagnosis | Alert if disagreement > threshold |
| Adversarial detection | Input may be adversarially modified | Reject + security alert |

#### 4.5.3 Input/Output Validation Metrics

```promql
# Input validation pass/fail rate
sum(rate(input_validation_total{status="passed"}[5m]))
/ sum(rate(input_validation_total[5m]))

# Output validation failures by type
sum(rate(output_validation_failed_total[5m])) by (validation_type)

# Inputs flagged for manual review
sum(rate(input_validation_flagged_total[1h])) by (flag_reason)

# Outputs requiring clinician confirmation
sum(rate(output_requiring_confirmation_total[1h])) by (model_name)
```

### 4.6 A/B Test Monitoring

A/B testing validates model improvements before full rollout.

#### 4.6.1 A/B Test Infrastructure

```python
AB_TEST_CONFIG = {
    "traffic_splitting": {
        "method": "consistent_hash",  # Same patient → same model
        "hash_key": "patient_id",
        "default_split": {"control": 0.9, "treatment": 0.1}
    },
    
    "metrics_tracked": {
        "online": {
            "latency_p50": {"type": "performance"},
            "latency_p95": {"type": "performance"},
            "gpu_memory": {"type": "resource"},
            "error_rate": {"type": "reliability"},
            "output_validation_pass_rate": {"type": "quality"}
        },
        "offline": {
            "requires_manual_review_rate": {"type": "clinical_workflow"},
            "clinician_override_rate": {"type": "clinical_acceptance"},
            "time_to_report_completion": {"type": "workflow"}
        },
        "delayed": {
            "ground_truth_accuracy": {
                "type": "clinical_accuracy",
                "available_after_days": 30,
                "metric": "auc_roc"
            },
            "clinical_outcome_correlation": {
                "type": "clinical_impact",
                "available_after_days": 90
            }
        }
    },
    
    "early_stopping": {
        "enabled": True,
        "conditions": {
            "harm_detected": {
                "treatment_accuracy < control_accuracy - 0.02",
                "action": "rollback_immediately"
            },
            "latency_regression": {
                "treatment_p95 > 1.5 * control_p95",
                "action": "pause_and_investigate"
            }
        }
    },
    
    "statistical_tests": {
        "primary": "sequential_probability_ratio_test",  # SPRT for early decisions
        "secondary": "frequentist_t_test",
        "tertiary": "bayesian_posterior_probability",
        "minimum_sample_size": 1000,
        "significance_level": 0.05,
        "power": 0.80
    }
}
```

#### 4.6.2 A/B Test Dashboard Metrics

| Panel | Type | Dimensions |
|-------|------|-----------|
| Traffic split | Pie chart | Control vs. Treatment |
| Sample size | Progress bar | vs. required minimum |
| Accuracy comparison | Bar chart | Control vs. Treatment with CI |
| Latency comparison | Box plot | By percentile |
| Error rate comparison | Line chart | Over time |
| Statistical significance | Indicator | p-value, power |
| Early stopping status | Status panel | Continue / Pause / Rollback |



---

## 5. Evidence DB & Research Pipeline

The Evidence Database powers DeepSynaps' clinical decision support by maintaining an up-to-date corpus of peer-reviewed neuropsychiatric research. Monitoring this pipeline ensures clinicians receive current, relevant evidence.

### 5.1 Paper Ingestion Rate

Paper ingestion is the lifeblood of the evidence platform. Monitoring ingestion rates ensures research coverage remains current.

#### 5.1.1 Ingestion Pipeline Architecture

```
Paper Ingestion Pipeline:

┌─────────────────────────────────────────────────────────────────────────┐
│                         SOURCES                                         │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │  PubMed  │ │  arXiv   │ │  bioRxiv │ │  Crossref│ │  OpenAlex│     │
│  │  (NCBI)  │ │  (Cornell)│ │ (CSHL)  │ │   (DOI)  │ │   (Meta) │     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘     │
│       │            │            │            │            │             │
│       └────────────┴────────────┼────────────┴────────────┘             │
│                                 │                                       │
│                                 ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │              INGESTION ORCHESTRATOR (Celery + Airflow)       │      │
│  │                                                              │      │
│  │  1. Fetch metadata      →  Rate-limited API calls            │      │
│  │  2. Download full-text  →  PDF/HTML retrieval                │      │
│  │  3. Extract content     →  Grobid/PDFMiner/Plumber           │      │
│  │  4. Parse structure     →  Section identification            │      │
│  │  5. Entity extraction   →  NER (diseases, drugs, methods)    │      │
│  │  6. Citation parsing    →  Anystyle/GLUTTON                  │      │
│  │  7. Quality scoring     →  Heuristic + ML classifier         │      │
│  │  8. Deduplication       →  MinHash + semantic similarity     │      │
│  │  9. Indexing            →  Elasticsearch bulk insert           │      │
│  │  10. Embeddings         →  Sentence-transformers → Vector DB │      │
│  │                                                              │      │
│  └──────────────────────────────┬───────────────────────────────┘      │
│                                 │                                       │
│                                 ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │                    STORAGE LAYERS                              │      │
│  │                                                              │      │
│  │  PostgreSQL → Document metadata, citations, relationships    │      │
│  │  Elasticsearch → Full-text search, faceted filtering         │      │
│  │  Milvus/Pinecone → Semantic search embeddings               │      │
│  │  S3 → Full-text PDFs, extracted figures, supplementary data  │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 5.1.2 Ingestion Metrics

| Metric | Unit | Collection Method | Alert Threshold |
|--------|------|-------------------|-----------------|
| Papers fetched per hour | count | Worker metrics | Drop > 50% from 7d avg |
| Papers successfully ingested per hour | count | Pipeline step metrics | Drop > 50% from 7d avg |
| Ingestion success rate | percentage | success / fetched | < 95% |
| API rate limit hits | count per hour | API client metrics | > 10/hour |
| Full-text retrieval success rate | percentage | Retrieved / available | < 80% |
| PDF parse success rate | percentage | Parsed / retrieved | < 90% |
| Entity extraction coverage | percentage | Papers with entities / total | < 85% |
| Average processing time per paper | seconds | Pipeline timing | > 300s (5 min) |
| Queue backlog (pending papers) | count | Queue depth | > 10,000 |
| Duplicate detection rate | percentage | Duplicates / total ingested | > 20% (indicates source issue) |

#### 5.1.3 Source-Specific Monitoring

```yaml
ingestion_sources:
  pubmed:
    api_endpoint: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    rate_limit: "10 requests/second"
    daily_fetch_target: 5000
    monitoring:
      - api_response_time
      - api_error_rate
      - rate_limit_remaining
      - new_papers_found_vs_expected
      - esearch_result_count
      - efetch_success_rate
      
  arxiv:
    api_endpoint: "http://export.arxiv.org/api/query"
    rate_limit: "1 request/3 seconds"
    daily_fetch_target: 500
    monitoring:
      - api_response_time
      - oai_harvest_success
      
  biorxiv:
    api_endpoint: "https://api.biorxiv.org/"
    rate_limit: "reasonable"
    daily_fetch_target: 1000
    
  crossref:
    api_endpoint: "https://api.crossref.org/"
    rate_limit: "50 requests/second (with polite pool)"
    monitoring:
      - citation_lookup_success_rate
      - doi_resolution_rate
```

#### 5.1.4 Ingestion Dashboard Panels

| Panel | Type | Refresh |
|-------|------|---------|
| Papers ingested (24h) | Stat with trend | 5m |
| Ingestion rate by source | Stacked area | 5m |
| Pipeline step durations | Waterfall/Bar | 5m |
| Queue depth by stage | Progress bar | 1m |
| Ingestion errors by type | Pie chart | 5m |
| Source API health | Status table | 1m |
| Backlog ETA | Stat | 5m |

### 5.2 Search Query Volume

Search is the primary interface between clinicians and the evidence database. Query volume and performance directly impact clinical workflow.

#### 5.2.1 Search Metrics

| Metric | Unit | Description |
|--------|------|-------------|
| Queries per second | qps | Real-time search volume |
| Queries per day | count | Daily volume |
| Unique queries per day | count | After normalization |
| Average query latency | ms | End-to-end response time |
| P95 query latency | ms | 95th percentile |
| Zero-result rate | percentage | Queries returning 0 results |
| Click-through rate | percentage | Users clicking a result |
| Average result position clicked | number | 1 = top result |
| Query refinement rate | percentage | Users modifying query |
| Search abandonment rate | percentage | Users leaving without click |
| Facet usage rate | percentage | Queries using filters |
| Semantic search usage | percentage | Vector vs. keyword search |

#### 5.2.2 Query Performance SLOs

| Query Type | P50 Target | P95 Target | P99 Target |
|-----------|-----------|-----------|-----------|
| Simple keyword | 50ms | 150ms | 300ms |
| Faceted search | 80ms | 250ms | 500ms |
| Semantic search (vector) | 100ms | 300ms | 600ms |
| Hybrid (keyword + semantic) | 150ms | 400ms | 800ms |
| Complex boolean | 200ms | 500ms | 1000ms |
| Autocomplete/suggestions | 20ms | 50ms | 100ms |

#### 5.2.3 Query Volume Anomalies

```yaml
search_anomaly_detection:
  patterns:
    - name: "sudden_query_spike"
      description: "Could indicate system issue generating searches"
      detection: "qps > 3 * 7d_median"
      severity: warning
      
    - name: "zero_result_spike"
      description: "Index may be corrupted or query parsing broken"
      detection: "zero_result_rate > 10% for > 5 minutes"
      severity: critical
      
    - name: "latency_regression"
      description: "Search cluster under pressure"
      detection: "p95_latency > 2x SLO for > 10 minutes"
      severity: warning
      
    - name: "popular_topic_emergence"
      description: "New clinical topic trending"
      detection: "new_query_cluster > 100 queries/hour"
      severity: info
      action: "alert_content_team"
```

### 5.3 Citation Update Frequency

Citation networks connect papers and enable evidence strength assessment. Keeping citations current is critical for evidence quality.

#### 5.3.1 Citation Graph Metrics

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Citation index freshness | < 7 days old | > 14 days |
| Citation lookups per day | > 50,000 | < 10,000 |
| Citation lookup success rate | > 99% | < 95% |
| New citations added per day | > 1,000 | < 500 |
| Citation graph coverage | > 90% of indexed papers | < 80% |
| Forward citation lag | < 30 days | > 60 days |
| Citation count accuracy | > 95% match with Crossref | < 90% |

#### 5.3.2 Citation Pipeline Monitoring

```python
CITATION_PIPELINE_MONITORING = {
    "update_frequency": {
        "full_graph_rebuild": "monthly",
        "incremental_updates": "daily",
        "hot_papers_priority": "hourly"
    },
    
    "metrics": {
        "citation_edges_total": "gauge",
        "citation_edges_added_daily": "counter",
        "citation_lookup_latency_ms": "histogram",
        "citation_lookup_errors": "counter",
        "papers_without_citations": "gauge",
        "graph_connected_components": "gauge",
    },
    
    "alerts": {
        "citation_index_stale": {
            "condition": "max(citation_index_last_updated) > now() - 7d",
            "severity": "warning"
        },
        "citation_graph_disconnected": {
            "condition": "graph_connected_components > expected * 1.5",
            "severity": "warning",
            "description": "Unusually many disconnected components may indicate data issue"
        }
    }
}
```

### 5.4 Database Sync Status

The evidence system spans PostgreSQL, Elasticsearch, and vector databases. Synchronization between these stores must be reliable.

#### 5.4.1 Sync Pipeline

```
Data Flow and Synchronization:

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  PostgreSQL  │─────▶│ Change Data  │─────▶│ Elasticsearch│
│  (canonical) │      │ Capture      │      │ (search)     │
│              │      │ (Debezium)   │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
       │                                           ▲
       │                                           │
       │       ┌──────────────┐                    │
       └──────▶│  Embedding   │────────────────────┘
              │  Generator   │
              │  (batch)     │
              └──────────────┘
                     │
                     ▼
              ┌──────────────┐
              │   Milvus     │
              │ (vector DB)  │
              └──────────────┘
```

#### 5.4.2 Sync Health Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| CDC lag | Time between PG commit and ES index | > 30 seconds |
| ES document count | Total indexed documents | Unexpected drop > 1% |
| PG-ES count diff | Difference in document counts | > 1000 documents |
| Embedding generation lag | Unembedded documents | > 5000 |
| Vector DB sync lag | Unsynced vectors | > 5000 |
| Failed CDC events | Events that couldn't be processed | > 10/hour |
| Reindex progress | % complete during reindex | Stuck for > 10 min |

#### 5.4.3 Sync Alert Rules

```promql
# CDC lag alert
max(cdc_lag_seconds) > 30

# Document count drift
abs(postgres_document_count - elasticsearch_document_count) > 1000

# Embedding backlog
embedding_queue_depth > 5000

# Failed CDC events
rate(cdc_failed_events_total[1h]) > 10
```

### 5.5 Index Health

Search index health directly impacts evidence discovery performance.

#### 5.5.1 Elasticsearch Cluster Health

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Cluster status | all primary/replica shards allocated | replica unassigned | primary unassigned |
| Active shards percent | 100% | < 100% | < 95% |
| Disk usage per node | < 70% | 70-85% | > 85% |
| JVM heap usage | < 70% | 70-85% | > 85% |
| Search latency P99 | < 500ms | 500ms-1s | > 1s |
| Indexing rate | stable | fluctuating | zero for > 5 min |
| Circuit breaker trips | 0 | occasional | frequent |
| GC collection time | < 100ms | 100-500ms | > 500ms |

#### 5.5.2 Index Metrics

```promql
# Elasticsearch cluster health
elasticsearch_cluster_health_status{color="green"} == 1

# Shard allocation
elasticsearch_cluster_health_active_shards
/ elasticsearch_cluster_health_number_of_shards

# Search latency
histogram_quantile(0.99, 
  sum(rate(elasticsearch_indices_search_query_time_seconds_bucket[5m])) by (le)
)

# JVM heap
elasticsearch_jvm_memory_used_bytes / elasticsearch_jvm_memory_max_bytes

# Indexing rate
rate(elasticsearch_indices_indexing_index_total[5m])

# Disk usage
elasticsearch_filesystem_data_used_bytes / elasticsearch_filesystem_data_total_bytes
```

#### 5.5.3 Index Maintenance

| Task | Frequency | Monitoring |
|------|-----------|-----------|
| Force merge (old indices) | Weekly | Duration, disk recovered |
| Index refresh optimization | Continuous | Refresh time |
| Cache warming | On deployment | Cache hit ratio |
| Alias rotation | Daily | Alias pointing correctness |
| Snapshot backup | Hourly | Success rate, duration |
| Segment count optimization | Daily | Segment count per shard |

---

## 6. MRI/qEEG Pipeline Health

Neuroimaging and neurophysiology pipelines are the core clinical value of DeepSynaps. Pipeline health directly affects patient care timelines.

### 6.1 Processing Queue Depth

#### 6.1.1 MRI Processing Pipeline

```
MRI Processing Stages:

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Upload     │───▶│  DICOM to    │───▶│  Quality     │───▶│  Anonymize   │
│   (S3)       │    │  NIfTI       │    │  Assurance   │    │  & Strip PHI │
│              │    │  (dcm2niix)  │    │  ( automated)│    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                     │
                              ┌──────────────────────────────────────┼──────┐
                              │                                      │      │
                              ▼                                      ▼      ▼
                       ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                       │  Registration│    │  Segmentation│    │  Brain Age   │
                       │  (FSL/ANTs)  │    │  (nnU-Net)   │    │  Estimation  │
                       │              │    │              │    │              │
                       └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
                              │                   │                    │
                              └───────────────────┼────────────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────┐
                                         │  Biomarker   │
                                         │  Extraction  │
                                         │              │
                                         └──────┬───────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                 │
                              ▼                 ▼                 ▼
                       ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                       │   Report     │ │   Database   │ │   Visualize  │
                       │   Generate   │ │   Store      │ │   (Viewer)   │
                       │              │ │              │ │              │
                       └──────────────┘ └──────────────┘ └──────────────┘
```

#### 6.1.2 qEEG Processing Pipeline

```
qEEG Processing Stages:

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Upload     │───▶│  Format      │───▶│  Channel     │───▶│  Montage     │
│   (EDF/BDF)  │    │  Validate    │    │  Map         │    │  Setup       │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                     │
                              ┌──────────────────────────────────────┼──────┐
                              │                                      │      │
                              ▼                                      ▼      ▼
                       ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                       │  Artifact    │    │  Spectral    │    │  Connectivity│
                       │  Detection   │    │  Analysis    │    │  Analysis    │
                       │  (ICA/ASR)   │    │  (Welch)     │    │  (wPLI/PLV)  │
                       └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
                              │                   │                    │
                              └───────────────────┼────────────────────┘
                                                  │
                                                  ▼
                                         ┌──────────────┐
                                         │  Normative   │
                                         │  Comparison  │
                                         │  (Z-scores)  │
                                         └──────┬───────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                 │
                              ▼                 ▼                 ▼
                       ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                       │   Biomarker  │ │   Report     │ │   Database   │
                       │   Scoring    │ │   Generate   │ │   Store      │
                       │              │ │              │ │              │
                       └──────────────┘ └──────────────┘ └──────────────┘
```

#### 6.1.3 Queue Depth by Stage

| Pipeline Stage | Queue Name | Normal Depth | Warning | Critical | SLA (P95) |
|---------------|-----------|-------------|---------|----------|-----------|
| MRI Upload → NIfTI | mri.preprocess | 0-5 | 10 | 25 | 2 min |
| MRI QA Check | mri.quality_check | 0-10 | 20 | 50 | 3 min |
| MRI Registration | mri.register | 0-5 | 10 | 25 | 5 min |
| MRI Segmentation | mri.segment | 0-10 | 20 | 50 | 15 min |
| MRI Brain Age | mri.brain_age | 0-10 | 15 | 40 | 10 min |
| MRI Biomarker | mri.biomarker | 0-5 | 10 | 25 | 5 min |
| MRI Report | mri.report | 0-20 | 50 | 200 | 2 min |
| qEEG Validate | qeeg.validate | 0-5 | 10 | 25 | 1 min |
| qEEG Artifact | qeeg.artifact | 0-10 | 20 | 50 | 8 min |
| qEEG Spectral | qeeg.spectral | 0-10 | 20 | 50 | 5 min |
| qEEG Connectivity | qeeg.connectivity | 0-10 | 20 | 50 | 10 min |
| qEEG Normative | qeeg.normative | 0-5 | 10 | 25 | 3 min |
| qEEG Report | qeeg.report | 0-20 | 50 | 200 | 2 min |

### 6.2 Analysis Completion Rate

The percentage of submitted analyses that complete successfully is a critical operational metric.

#### 6.2.1 Completion Rate SLOs

| Analysis Type | Target | Warning | Critical |
|--------------|--------|---------|----------|
| MRI Full Pipeline (T1) | > 99.5% | < 99.0% | < 98.0% |
| MRI Full Pipeline (T2-FLAIR) | > 99.0% | < 98.5% | < 97.5% |
| qEEG Full Pipeline | > 99.5% | < 99.0% | < 98.0% |
| Combined MRI + qEEG | > 99.0% | < 98.5% | < 97.0% |
| Report Generation | > 99.9% | < 99.5% | < 99.0% |
| Re-processing (after edit) | > 99.0% | < 98.0% | < 97.0% |

#### 6.2.2 Completion Tracking

```python
COMPLETION_TRACKING = {
    "status_lifecycle": [
        ("uploaded", "timestamp_uploaded"),
        ("validated", "timestamp_validated"),
        ("queued", "timestamp_queued"),
        ("preprocessing", "timestamp_preprocessing"),
        ("processing", "timestamp_processing"),
        ("quality_check", "timestamp_qa"),
        ("biomarker_extraction", "timestamp_biomarkers"),
        ("report_generation", "timestamp_report"),
        ("completed", "timestamp_completed"),
        ("failed", "timestamp_failed"),
        ("cancelled", "timestamp_cancelled")
    ],
    
    "completion_metrics": {
        "overall_completion_rate": {
            "calculation": "completed / (completed + failed)",
            "window": "24h",
            "dimensions": ["analysis_type", "clinic_id", "scanner_model"]
        },
        "stage_dropout_rate": {
            "calculation": "failed_at_stage / entered_stage",
            "purpose": "Identify which stage fails most"
        },
        "time_to_completion": {
            "calculation": "completed_at - uploaded_at",
            "percentiles": [50, 90, 95, 99],
            "target_p95": {
                "mri_standard": 1200,      # 20 minutes
                "mri_complex": 1800,        # 30 minutes
                "qeeg_standard": 600,       # 10 minutes
                "qeeg_complex": 900         # 15 minutes
            }
        }
    }
}
```

#### 6.2.3 Completion Dashboard

| Panel | Type | Details |
|-------|------|---------|
| Completion rate (24h) | Stat + sparkline | By analysis type |
| Pipeline funnel | Funnel chart | Uploaded → Validated → Processed → Reported |
| Failure rate by stage | Stacked bar | Top failure stages |
| Time to completion distribution | Histogram | P50, P95 overlay |
| In-progress analyses | Gauge | Current active |
| Stuck analyses | Table | > 30 min without progress |

### 6.3 Processing Time Trends

Tracking processing time trends detects performance regressions, resource constraints, and data quality issues.

#### 6.3.1 Processing Time Baselines

| Analysis | Input Size | Baseline P50 | Baseline P95 | Scaling Factor |
|----------|-----------|-------------|-------------|----------------|
| DICOM to NIfTI | 150 MB | 30s | 60s | Linear with file count |
| MRI Quality Check | 25 MB NIfTI | 45s | 90s | Fixed |
| MRI Registration (T1→MNI) | 25 MB | 120s | 240s | Fixed |
| MRI Segmentation (T1, full) | 25 MB | 300s | 480s | Fixed |
| MRI Segmentation (T2-FLAIR) | 25 MB | 420s | 720s | Fixed |
| MRI Brain Age | 25 MB | 180s | 300s | Fixed |
| MRI Biomarker Extraction | 25 MB + masks | 120s | 240s | Fixed |
| MRI Report Generation | All results | 30s | 60s | Fixed |
| qEEG Validation | 80 MB | 15s | 30s | Linear with duration |
| qEEG Artifact Removal | 80 MB | 300s | 480s | Linear with channels |
| qEEG Spectral Analysis | 80 MB clean | 120s | 240s | Linear with channels |
| qEEG Connectivity | 80 MB clean | 180s | 360s | Quadratic with channels |
| qEEG Normative Scoring | Features | 30s | 60s | Fixed |
| qEEG Report Generation | All results | 30s | 60s | Fixed |

#### 6.3.2 Processing Time Regression Detection

```promql
# Processing time P95 vs baseline
histogram_quantile(0.95, 
  sum(rate(mri_processing_duration_seconds_bucket[1h])) by (stage, le)
)
/ 
mri_processing_duration_baseline_p95

# Alert if P95 exceeds 1.5x baseline
- alert: MRIProcessingTimeRegression
  expr: mri_processing_p95_1h / mri_processing_baseline_p95 > 1.5
  for: 30m
  labels:
    severity: warning
  annotations:
    summary: "MRI {{ $labels.stage }} P95 latency 1.5x over baseline"
    
# Alert if P99 exceeds 2x baseline
- alert: MRIProcessingTimeCriticalRegression
  expr: mri_processing_p99_1h / mri_processing_baseline_p99 > 2.0
  for: 15m
  labels:
    severity: critical
```

#### 6.3.3 Seasonal and Growth Adjustments

```python
PROCESSING_TIME_ADJUSTMENTS = {
    "seasonal_patterns": {
        "weekday_peak": {"tuesday_thursday": "+20% volume"},
        "weekend_trough": {"saturday_sunday": "-60% volume"},
        "month_end": {"clinic_reporting": "+30% volume"},
        "conference_season": {"november": "-10% volume"}
    },
    "growth_expectations": {
        "weekly_growth_rate": 0.05,  # 5% WoW
        "monthly_growth_rate": 0.20,  # 20% MoM
        "capacity_headroom": 0.30     # Maintain 30% spare capacity
    },
    "auto_scaling_triggers": {
        "queue_depth": {"scale_up": "> 10", "scale_down": "< 3"},
        "wait_time": {"scale_up": "> 300s", "scale_down": "< 60s"},
        "processing_time_regression": {"scale_up": "> 1.3x baseline"}
    }
}
```

### 6.4 Error Rate by Analysis Type

Different analysis types have different failure modes. Granular error tracking enables targeted improvements.

#### 6.4.1 Error Taxonomy

| Error Category | MRI Examples | qEEG Examples | Severity |
|---------------|-------------|---------------|----------|
| `INPUT_CORRUPT` | Corrupt DICOM, truncated file | Corrupt EDF, missing channels | Error |
| `INPUT_UNSUPPORTED` | Unknown sequence, scanner model | Unsupported montage, sampling rate | Error |
| `INPUT_QUALITY` | Motion artifact, poor SNR | Excessive artifact, bad electrodes | Warning |
| `INPUT_SIZE` | File too large/small | Recording too short | Error |
| `PROCESSING_TIMEOUT` | Segmentation exceeded limit | ICA didn't converge | Critical |
| `PROCESSING_OOM` | GPU out of memory | CPU memory exhausted | Critical |
| `PROCESSING_BUG` | Unexpected exception | Numerical instability | Critical |
| `QUALITY_CHECK_FAIL` | Registration failed QA | No clean segments found | Warning |
| `DEPENDENCY_FAILURE` | Model download failed | Normative database unavailable | Warning |
| `DOWNSTREAM_FAIL` | Biomarker stage failed | Feature extraction failed | Warning |

#### 6.4.2 Error Rate Tracking

```promql
# Error rate by analysis type and error category
sum(rate(analysis_failed_total[1h])) by (analysis_type, error_category)
/
sum(rate(analysis_total[1h])) by (analysis_type)

# Error rate by clinic (detect clinic-specific issues)
sum(rate(analysis_failed_total[1h])) by (clinic_id)
/
sum(rate(analysis_total[1h])) by (clinic_id)

# Error rate by scanner model (detect hardware-specific issues)
sum(rate(mri_analysis_failed_total[1h])) by (scanner_manufacturer, scanner_model)
/
sum(rate(mri_analysis_total[1h])) by (scanner_manufacturer, scanner_model)

# Error rate by software version
sum(rate(analysis_failed_total[1h])) by (pipeline_version)
/
sum(rate(analysis_total[1h])) by (pipeline_version)
```

#### 6.4.3 Error Correlation Analysis

| Analysis | Correlation Pattern | Interpretation |
|----------|-------------------|----------------|
| Errors by hour-of-day | Spike at 9 AM | Clinic batch uploads |
| Errors by scanner model | Siemens MAGNETOM VIDA high | Sequence incompatibility |
| Errors by clinic | Single clinic elevated | Training or hardware issue |
| Errors by pipeline version | New version higher | Regression in release |
| Errors by file size | Large files fail more | Storage or memory issue |

### 6.5 Storage Per Analysis

Storage per analysis type informs cost allocation and capacity planning.

#### 6.5.1 Storage Breakdown by Analysis Type

| Data Type | Size Range | Retention | Compression |
|-----------|-----------|-----------|-------------|
| Raw DICOM (MRI) | 100-500 MB | 7 years | JPEG-LS lossless |
| NIfTI (MRI) | 10-50 MB | 7 years | gzip |
| Registration outputs | 50-150 MB | 7 years | gzip |
| Segmentation masks | 20-80 MB | 7 years | gzip |
| Surface meshes | 10-30 MB | 7 years | gzip |
| Brain age model outputs | 1-5 MB | 7 years | none |
| Biomarker features (MRI) | 5-20 MB | 7 years | gzip |
| Raw EEG (qEEG) | 50-200 MB | 7 years | lossless |
| Cleaned EEG (qEEG) | 50-200 MB | 3 years | gzip |
| Spectral features | 10-50 MB | 7 years | gzip |
| Connectivity matrices | 20-100 MB | 7 years | gzip |
| Normative comparison results | 5-15 MB | 7 years | gzip |
| Generated reports (PDF) | 0.5-5 MB | 7 years | none |
| Thumbnail images | 0.1-1 MB each | 7 years | JPEG |
| Processing logs | 0.1-1 MB | 90 days | gzip |

#### 6.5.2 Average Total Storage Per Patient Study

| Study Type | Components | Average Total | 95th Percentile |
|-----------|-----------|---------------|-----------------|
| MRI only (T1) | DICOM + NIfTI + masks + features + report | 350 MB | 800 MB |
| MRI (T1 + T2-FLAIR) | All T1 + T2 processing | 650 MB | 1.5 GB |
| qEEG only | Raw + clean + spectral + connectivity + report | 250 MB | 600 MB |
| Combined MRI + qEEG | All components | 850 MB | 2.0 GB |
| Longitudinal (2 timepoints) | 2x single study + delta | 1.6 GB | 3.5 GB |

#### 6.5.3 Storage Growth Model

```python
STORAGE_GROWTH_MODEL = {
    "current_projections": {
        "studies_per_month": 5000,
        "avg_study_size_mb": 850,
        "monthly_new_storage_tb": 5000 * 850 / 1024 / 1024,  # ~4.1 TB/month
        "annual_growth_rate": 1.25,  # 25% YoY growth
    },
    "cost_optimization": {
        "tiering_policy": {
            "hot_s3_standard": "last 90 days",
            "warm_s3_intelligent_tiering": "90 days - 2 years",
            "cold_s3_glacier": "2 - 7 years",
            "deep_archive": "> 7 years (regulatory archive)"
        },
        "compression_savings": {
            "dicom_to_jpeg_ls": 0.40,      # 40% reduction
            "nifti_gzip": 0.30,            # 30% reduction
            "eeg_compression": 0.50,       # 50% reduction
        },
        "deduplication": {
            "patient_re scans": "reference prior instead of copy",
            "template_atlases": "single copy referenced",
            "normative_databases": "single copy per version"
        }
    }
}
```

---

## 7. Cost Tracking

Healthcare SaaS requires transparent cost management. The platform tracks costs per clinic, per analysis type, and per API endpoint to enable accurate billing and margin analysis.

### 7.1 Infrastructure Cost

#### 7.1.1 Cost Allocation Framework

```
Cost Allocation Hierarchy:

┌─────────────────────────────────────────────────────────────────────┐
│                    TOTAL CLOUD COST                                 │
│                                                                     │
│  ├─ Compute (EC2/GKE)                                             │
│  │   ├─ GPU nodes (NVIDIA A100, T4, V100)                         │
│  │   ├─ CPU nodes (API services, workers)                         │
│  │   ├─ Control plane (Kubernetes, management)                    │
│  │   └─ Spot/preemptible instances                                 │
│  │                                                                 │
│  ├─ Storage                                                         │
│  │   ├─ S3 (DICOM, NIfTI, reports, logs)                          │
│  │   ├─ EBS (databases, caches)                                   │
│  │   ├─ EFS (shared filesystems)                                  │
│  │   └─ Backup storage                                             │
│  │                                                                 │
│  ├─ Database                                                        │
│  │   ├─ RDS PostgreSQL (primary, replicas)                        │
│  │   ├─ ElastiCache Redis                                         │
│  │   ├─ Elasticsearch                                            │
│  │   └─ Vector database (Milvus)                                  │
│  │                                                                 │
│  ├─ Networking                                                      │
│  │   ├─ Data transfer (ingress/egress)                            │
│  │   ├─ NAT Gateway                                                │
│  │   ├─ Load balancers                                            │
│  │   ├─ CDN (Cloudflare)                                          │
│  │   └─ Inter-AZ traffic                                          │
│  │                                                                 │
│  ├─ AI/ML Services                                                  │
│  │   ├─ External API calls (OpenAI, Anthropic)                    │
│  │   ├─ Model hosting infrastructure                              │
│  │   └─ Training compute                                          │
│  │                                                                 │
│  ├─ Observability                                                   │
│  │   ├─ Monitoring (Prometheus, Grafana)                          │
│  │   ├─ Logging (Loki, CloudWatch)                                │
│  │   ├─ APM (Jaeger)                                              │
│  │   └─ Alerting (PagerDuty)                                      │
│  │                                                                 │
│  └─ Security & Compliance                                           │
│      ├─ WAF                                                         │
│      ├─ Secrets management                                          │
│      ├─ Audit logging                                               │
│      └─ Compliance scanning                                         │
└─────────────────────────────────────────────────────────────────────┘
```

#### 7.1.2 Compute Cost Breakdown

| Resource Type | Instance | On-Demand/Hr | Spot/Hr | Typical Usage |
|--------------|----------|-------------|---------|---------------|
| GPU (training) | NVIDIA A100 80GB | $3.67 | $1.10 | Scheduled jobs |
| GPU (inference) | NVIDIA A100 40GB | $2.50 | $0.75 | Always-on pool |
| GPU (qEEG) | NVIDIA T4 16GB | $0.35 | $0.11 | Auto-scaled |
| CPU (API) | c6i.2xlarge (8 vCPU) | $0.34 | $0.10 | Auto-scaled 2-20 |
| CPU (workers) | c6i.4xlarge (16 vCPU) | $0.68 | $0.20 | Auto-scaled 2-50 |
| Memory (cache) | r6i.2xlarge (64 GB) | $0.50 | — | Redis cluster |
| Control plane | EKS/GKE | $0.10/hr/cluster | — | 2 clusters |

#### 7.1.3 Compute Cost Allocation Tags

```yaml
cost_allocation_tags:
  required_tags:
    - environment: [production, staging, development]
    - service: [api, mri-pipeline, qeeg-pipeline, evidence-db, reporting, platform]
    - component: [gpu-worker, cpu-worker, api-server, database, cache, queue]
    - clinic_id: "C{6-digit}"  # For per-clinic allocation
    - analysis_type: [mri_t1, mri_t2_flair, qeeg_standard, qeeg_extended]
    
  optional_tags:
    - job_id: "uuid"
    - patient_study_id: "uuid"  # Anonymized
    - model_version: "semantic_version"
    - pipeline_version: "semantic_version"
    
  reporting_dimensions:
    - by_clinic: "sum(cost) GROUP BY clinic_id"
    - by_service: "sum(cost) GROUP BY service"
    - by_environment: "sum(cost) GROUP BY environment"
    - by_analysis: "sum(cost) GROUP BY analysis_type"
```

### 7.2 AI/ML Costs Per Clinic

#### 7.2.1 ML Cost Components

| Cost Component | Unit Price | Billing Model |
|---------------|-----------|---------------|
| MRI Segmentation (T1) | $0.15 | Per scan |
| MRI Segmentation (T2-FLAIR) | $0.20 | Per scan |
| MRI Brain Age | $0.08 | Per scan |
| qEEG Artifact Removal | $0.05 | Per recording |
| qEEG Spectral Analysis | $0.04 | Per recording |
| qEEG Connectivity | $0.06 | Per recording |
| Report Generation (AI) | $0.02 | Per report |
| Evidence Search | $0.001 | Per query |
| External LLM calls | Varies | Token-based |

#### 7.2.2 Clinic Cost Attribution

```python
CLINIC_COST_ATTRIBUTION = {
    "direct_costs": {
        "mri_analyses": "count(mri_scans) * unit_price_per_type",
        "qeeg_analyses": "count(qeeg_recordings) * unit_price_per_type",
        "reports_generated": "count(reports) * unit_price",
        "evidence_searches": "count(searches) * unit_price",
        "storage_used": "avg_daily_storage_gb * price_per_gb_month",
        "api_calls": "count(api_calls) * compute_cost_per_call"
    },
    
    "indirect_costs_allocation": {
        "platform_overhead": {
            "description": "Shared platform costs (monitoring, security, control plane)",
            "allocation_basis": "proportional_to_direct_costs",
            "percentage": 0.15  # 15% overhead
        },
        "idle_capacity": {
            "description": "Warm GPU pools, reserved instances",
            "allocation_basis": "proportional_to_peak_usage",
            "calculation": "idle_cost * (clinic_peak_gpu / total_peak_gpu)"
        },
        "rd_shared": {
            "description": "Shared R&D infrastructure",
            "allocation_basis": "fixed_monthly_fee",
            "only_for": "enterprise_tier_clinics"
        }
    },
    
    "cost_visibility": {
        "real_time_dashboard": True,
        "daily_email_digest": True,
        "monthly_invoice": True,
        "cost_anomaly_alerts": True,
        "budget_threshold_alerts": [0.5, 0.75, 0.9, 1.0]
    }
}
```

### 7.3 GPU Costs

#### 7.3.1 GPU Cost Optimization

| Strategy | Implementation | Expected Savings |
|----------|---------------|-----------------|
| Spot/preemptible instances | Fallback to on-demand if spot unavailable | 60-70% |
| MIG (Multi-Instance GPU) | Partition A100 into 7x 1/7 GPU instances | 40% better utilization |
| Model batching | Batch multiple inference requests | 30-50% throughput |
| Model quantization | FP16/INT8 inference where acceptable | 2-4x speedup |
| Dynamic batching | Triton Inference Server | 20-30% efficiency |
| Right-sizing | Match GPU to model requirements | 20-30% cost reduction |
| Time-of-day scaling | Scale down off-hours | 30-40% for non-24h clinics |
| Model caching | Keep hot models loaded, evict cold | Reduce load latency 90% |

#### 7.3.2 GPU Cost Per Inference

| Model | GPU Type | Avg Inference Time | GPU Cost Per Inference |
|-------|----------|-------------------|----------------------|
| MRI Segmentation T1 | A100 40GB | 5 min | $0.21 |
| MRI Segmentation T2 | A100 40GB | 7 min | $0.29 |
| MRI Brain Age | A100 40GB | 3 min | $0.13 |
| qEEG Artifact Removal | T4 16GB | 4 min | $0.02 |
| qEEG Spectral | T4 16GB | 2 min | $0.01 |
| qEEG Connectivity | T4 16GB | 3 min | $0.02 |

#### 7.3.3 GPU Utilization vs. Cost Efficiency

```promql
# Cost per successful inference
gpu_cost_per_hour 
* (inference_gpu_time_seconds / 3600)
/ inference_success_total

# GPU utilization efficiency
dcgm_gpu_utilization 
* (1 - dcgm_gpu_memory_idle_percent)

# Cost per clinic per day
sum by (clinic_id) (
  gpu_cost_per_hour 
  * inference_gpu_time_seconds_per_clinic / 3600
)
```

### 7.4 Storage Costs Per Analysis Type

#### 7.4.1 Storage Pricing Tiers

| Storage Tier | Cost per GB/Month | Use Case | Access Pattern |
|-------------|-------------------|----------|----------------|
| S3 Standard | $0.023 | Active cases (< 90 days) | Frequent |
| S3 Intelligent-Tiering | $0.0125-0.023 | Variable access | Automatic |
| S3 Standard-IA | $0.0125 | Infrequent access | Monthly |
| S3 One Zone-IA | $0.01 | Non-critical copies | Monthly |
| S3 Glacier | $0.004 | Archive (1-7 years) | Quarterly |
| S3 Glacier Deep Archive | $0.00099 | Long-term archive | Yearly |
| EBS gp3 | $0.08 | Database volumes | Constant |
| EFS Standard | $0.30 | Shared file access | Daily |

#### 7.4.2 Storage Cost by Analysis Type

| Analysis Type | Hot Storage (90d) | Warm Storage (2yr) | Cold Archive (7yr) | Total 7-Year |
|--------------|-------------------|-------------------|-------------------|--------------|
| MRI T1 only | $0.02 | $0.05 | $0.12 | $0.19 |
| MRI T1+T2 | $0.03 | $0.08 | $0.20 | $0.31 |
| qEEG standard | $0.01 | $0.03 | $0.07 | $0.11 |
| Combined MRI+qEEG | $0.04 | $0.10 | $0.25 | $0.39 |

### 7.5 API Cost Per Endpoint

#### 7.5.1 Endpoint Cost Attribution

| Endpoint Category | Cost Driver | Unit Cost | Monthly Volume |
|------------------|-------------|-----------|----------------|
| Auth (login/refresh) | CPU time | $0.0001 | 5M |
| Patient CRUD | CPU + DB | $0.0005 | 2M |
| MRI Upload | Bandwidth + CPU | $0.01 | 100K |
| MRI Status | DB read | $0.0001 | 500K |
| MRI Results | Bandwidth + DB | $0.002 | 200K |
| qEEG Upload | Bandwidth + CPU | $0.008 | 150K |
| Evidence Search | ES query + CPU | $0.005 | 1M |
| Report View | Bandwidth + DB | $0.001 | 300K |
| Export Data | Bandwidth + CPU + Storage | $0.05 | 10K |
| WebSocket (realtime) | Connection + CPU | $0.001/hr | 50K conn-hrs |

#### 7.5.2 Endpoint Performance vs. Cost

```python
ENDPOINT_COST_MODEL = {
    "cost_components_per_request": {
        "compute": "cpu_seconds * cpu_cost_per_second",
        "memory": "memory_gb_seconds * memory_cost_per_gb_second",
        "database": "query_count * avg_query_cost",
        "storage_io": "read_bytes * read_cost + write_bytes * write_cost",
        "network": "egress_bytes * egress_cost_per_gb",
        "gpu": "gpu_seconds * gpu_cost_per_second"
    },
    
    "optimization_opportunities": {
        "caching": {
            "description": "Cache frequent queries",
            "applies_to": ["/api/v1/evidence/search", "/api/v1/patients/{id}"],
            "expected_reduction": 0.60
        },
        "compression": {
            "description": "Compress API responses",
            "applies_to": ["/api/v1/mri/results", "/api/v1/qeeg/results"],
            "expected_reduction": 0.40
        },
        "pagination": {
            "description": "Limit default page sizes",
            "applies_to": ["/api/v1/patients", "/api/v1/evidence/search"],
            "expected_reduction": 0.30
        }
    }
}
```

### 7.6 Cost Per Clinic

#### 7.6.1 Clinic Cost Dashboard

| Metric | Visualization | Refresh |
|--------|--------------|---------|
| Total monthly cost | Stat + trend | Daily |
| Cost breakdown by service | Donut chart | Daily |
| Cost per study | Bar chart | Daily |
| Cost vs. revenue | Line chart | Monthly |
| Cost anomaly detection | Alert panel | Real-time |
| Budget utilization | Progress bar | Daily |
| Cost comparison to similar clinics | Benchmark | Weekly |

#### 7.6.2 Cost Anomaly Detection

```python
COST_ANOMALY_DETECTION = {
    "algorithms": {
        "statistical": {
            "method": "isolation_forest",
            "features": ["daily_cost", "study_count", "storage_growth", "api_calls"],
            "contamination": 0.01  # 1% expected anomalies
        },
        "rule_based": {
            "daily_cost_spike": "cost > 2 * 30d_median",
            "weekend_activity": "cost > 0 on sunday (for non-emergency clinics)",
            "storage_growth_spike": "growth > 3 * normal_rate"
        }
    },
    
    "alert_recipients": {
        "platform_ops": "all_anomalies",
        "clinic_manager": "anomalies_affecting_their_clinic",
        "finance_team": "anomalies > $1000/day",
        "engineering": "infrastructure_efficiency_anomalies"
    }
}
```

#### 7.6.3 Budget Management

| Alert Threshold | Action | Recipients |
|----------------|--------|-----------|
| 50% of monthly budget | Informational notification | Clinic admin |
| 75% of monthly budget | Warning + cost optimization tips | Clinic admin + Account manager |
| 90% of monthly budget | Urgent + optional throttling | Clinic admin + Finance + Ops |
| 100% of monthly budget | Throttle non-essential + escalate | All stakeholders |
| 2x expected daily spend | Anomaly investigation | Platform ops |



---

## 8. Alerting Patterns

Effective alerting is the difference between proactive incident management and reactive firefighting. DeepSynaps implements a multi-layered alerting strategy that respects operator attention and prevents alert fatigue.

### 8.1 Severity Levels

Alert severity determines routing, response time expectations, and escalation paths.

#### 8.1.1 Severity Definitions

| Severity | Color | Response Time | Who Responds | Description |
|----------|-------|--------------|--------------|-------------|
| **CRITICAL (P1)** | Red | 5 minutes | On-call engineer + team lead | Patient safety risk, data loss, complete outage |
| **WARNING (P2)** | Orange | 30 minutes | On-call engineer | Service degradation, capacity concerns, performance regression |
| **INFO (P3)** | Blue | 4 hours | Area owner | Notable events, threshold crossings, informational |
| **DEBUG (P4)** | Gray | Next business day | Team | Low-priority observations, optimization opportunities |

#### 8.1.2 Severity Assignment Matrix

| Condition | Severity | Justification |
|-----------|----------|---------------|
| MRI/qEEG pipeline completely down | CRITICAL | Clinical workflow blocked |
| GPU cluster unavailable | CRITICAL | Cannot process neuroimaging |
| Database primary unreachable | CRITICAL | All services affected |
| API response time > 10s | CRITICAL | User experience unacceptable |
| SSL certificate expired | CRITICAL | Security incident |
| Any PII/PHI exposure detected | CRITICAL | Compliance violation |
| Queue depth > critical threshold | WARNING | Processing delays imminent |
| Model accuracy drift > 5% | WARNING | Clinical quality concern |
| DB replication lag > 60s | WARNING | Read consistency risk |
| Storage > 80% capacity | WARNING | Need capacity action |
| Single worker failure | INFO | Auto-healing expected |
| Cost anomaly detected | INFO | Review within 4 hours |
| Evidence index update completed | INFO | Normal operation confirmation |
| Daily processing summary | DEBUG | Next-day review |

#### 8.1.3 Severity Overrides

```python
SEVERITY_OVERRIDES = {
    "business_hours_boost": {
        "description": "Increase severity during business hours",
        "window": "weekdays 07:00-19:00 clinic local time",
        "effect": "WARNING becomes CRITICAL if affects active clinics"
    },
    
    "cascade_prevention": {
        "description": "Prevent duplicate alerts from cascading failures",
        "rule": "If CRITICAL alert fires for 'database_down', suppress dependent warnings",
        "suppressed_alerts": [
            "api_latency_high",
            "queue_depth_high", 
            "worker_unavailable",
            "search_latency_high"
        ],
        "max_suppression_duration": "30 minutes"
    },
    
    "repeat_escalation": {
        "description": "Escalate severity if alert persists",
        "rules": [
            {"after": "15 minutes", "escalate_to": "WARNING if INFO"},
            {"after": "30 minutes", "escalate_to": "CRITICAL if WARNING"},
            {"after": "1 hour", "add_page": "team_manager"}
        ]
    }
}
```

### 8.2 Alert Routing

Alerts are routed to the right people through the right channels at the right time.

#### 8.2.1 Routing Architecture

```
Alert Routing Flow:

┌──────────────┐
│   Alert      │
│  Generated   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Severity    │
│  Classifier  │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              Routing Rules Engine                     │
│                                                      │
│  CRITICAL ─────────────────────────────────────┐    │
│  ├── PagerDuty (page immediately)               │    │
│  ├── Slack #incidents (thread auto-created)     │    │
│  ├── SMS to on-call (backup)                    │    │
│  ├── Phone call (if unacknowledged 5 min)       │    │
│  └── Auto-create incident ticket                │    │
│                                                   │    │
│  WARNING ────────────────────────────────────┐   │    │
│  ├── Slack #alerts-warning                    │   │    │
│  ├── PagerDuty (low-urgency notification)     │   │    │
│  └── Jira ticket (auto-create if sustained)   │   │    │
│                                               │   │    │
│  INFO ───────────────────────────────────┐    │   │    │
│  ├── Slack #alerts-info                  │    │   │    │
│  ├── Email digest (hourly)               │    │   │    │
│  └── Dashboard annotation                │    │   │    │
│                                          │    │   │    │
│  DEBUG ─────────────────────────────┐    │    │   │    │
│  ├── Slack #alerts-debug (muted)    │    │    │   │    │
│  └── Log only                       │    │    │   │    │
│                                     │    │    │   │    │
└─────────────────────────────────────┼────┼────┼───┼────┘
                                      │    │    │   │
                                      ▼    ▼    ▼   ▼
                                ┌──────────────────────┐
│                               │   Notification       │
│                               │   Delivery           │
│                               │   (with retry)       │
│                               └──────────────────────┘
```

#### 8.2.2 Channel Configuration

**PagerDuty Integration:**
```yaml
pagerduty:
  service_key: "deepsynaps-platform"
  
  urgency_rules:
    critical:
      urgency: "high"
      notification_timeout: 300  # 5 minutes
      escalation_policy: "platform-engineering-escalation"
      
    warning:
      urgency: "low"
      notification_timeout: 1800  # 30 minutes
      escalation_policy: "platform-engineering-standard"
      
  incident_workflows:
    auto_create_incident: true
    auto_assign_team: "platform-engineering"
    auto_add_responders: ["ml-engineering-oncall"]
    status_page_update: true
```

**Slack Integration:**
```yaml
slack:
  channels:
    incidents:
      name: "#incidents"
      severity: [critical]
      features: [thread_per_incident, auto_status_updates, runbook_links]
      
    alerts-warning:
      name: "#alerts-warning"
      severity: [warning]
      features: [group_related, deduplicate_5m]
      
    alerts-info:
      name: "#alerts-info"
      severity: [info]
      features: [batch_hourly]
      
    cost-alerts:
      name: "#cost-optimization"
      alert_types: [cost_anomaly, budget_threshold]
      recipients: [finance, platform_ops]
      
    ml-alerts:
      name: "#ml-monitoring"
      alert_types: [model_drift, inference_latency, gpu_failure]
      recipients: [ml-engineering]
```

**Email Routing:**
```yaml
email:
  critical:
    to: ["oncall@deepsynaps.io", "platform-leads@deepsynaps.io"]
    subject_prefix: "[CRITICAL]"
    rate_limit: "no_limit"
    
  warning:
    to: ["oncall@deepsynaps.io"]
    subject_prefix: "[WARNING]"
    rate_limit: "max_10_per_hour"
    
  digest:
    to: ["team@deepsynaps.io"]
    frequency: "daily 08:00"
    content: "summary_of_all_warnings_and_info"
```

#### 8.2.3 Routing by Service

| Service | CRITICAL Routing | WARNING Routing | INFO Routing |
|---------|-----------------|-----------------|--------------|
| API Platform | On-call + Slack #incidents | Slack #alerts-warning | Slack #alerts-info |
| MRI Pipeline | On-call + ML team + Slack | Slack #alerts-warning | Slack #alerts-info |
| qEEG Pipeline | On-call + ML team + Slack | Slack #alerts-warning | Slack #alerts-info |
| Evidence DB | On-call + Content team | Slack #alerts-warning | Slack #alerts-info |
| AI/ML Models | ML on-call + Slack #ml-alerts | Slack #ml-alerts | Slack #ml-alerts |
| Cost/Finance | On-call + Finance team | Slack #cost-alerts | Slack #cost-alerts |
| Security | Security on-call + CISO | Slack #security | Email digest |

### 8.3 Alert Fatigue Prevention

Alert fatigue degrades response quality. DeepSynaps implements multiple mechanisms to keep alerts actionable.

#### 8.3.1 Deduplication

```yaml
alert_deduplication:
  methods:
    # Group similar alerts within time window
    temporal_grouping:
      window: "5m"
      group_by: [alertname, service, severity]
      max_alerts_per_group: 3
      
    # Suppress known flaky alerts during maintenance
    maintenance_suppression:
      enabled: true
      source: "pagerduty_maintenance_windows"
      auto_extend: "15m_after_window"
      
    # Group by root cause
    root_cause_grouping:
      enabled: true
      example: "If 'database_down' fires, suppress all DB-dependent alerts"
      
  implementation:
    alertmanager:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h  # Max repeat for same alert
```

#### 8.3.2 Alert Quality Scoring

```python
ALERT_QUALITY_SCORING = {
    "metrics_tracked": {
        "false_positive_rate": "alerts_without_action / total_alerts",
        "mean_time_to_close": "avg duration from trigger to resolution",
        "acknowledgment_rate": "alerts_acked / total_alerts",
        "actionable_rate": "alerts_requiring_human_action / total",
        "repeat_rate": "alerts_triggering > 3x in 24h / total"
    },
    
    "quality_targets": {
        "false_positive_rate": "< 10%",
        "actionable_rate": "> 80%",
        "acknowledgment_rate": "> 95%",
        "repeat_rate": "< 5%"
    },
    
    "improvement_process": {
        "weekly_review": {
            "participants": ["oncall_engineer", "team_lead"],
            "agenda": [
                "Review all alerts from past week",
                "Identify top 3 most noisy alerts",
                "Propose tuning for each",
                "Track false positive rate trend"
            ]
        },
        "alert_tuning_cadence": "biweekly",
        "retirement_threshold": "If alert fires 10x with 0 actions in 30d, retire or retune"
    }
}
```

#### 8.3.3 On-Call Well-being

| Policy | Description |
|--------|-------------|
| Maximum alert frequency | No more than 2 pages/hour sustained |
| Quiet hours | INFO/WARNING alerts batched 22:00-07:00 local time |
| Follow-the-sun | On-call rotates between US-East, EU-Central, APAC |
| Post-incident rest | 4-hour cooldown after CRITICAL before next page |
| Weekly alert budget | Target: < 10 CRITICAL alerts/week across all teams |
| Monthly review | All engineers review alert quality in retro |

### 8.4 Runbook Links

Every alert includes a link to a runbook — a step-by-step guide for diagnosis and resolution.

#### 8.4.1 Runbook Structure

```markdown
## Runbook Template

### Alert: [ALERT_NAME]

**Severity:** [CRITICAL|WARNING|INFO]
**Service:** [Service Name]
**Last Updated:** [Date]

### Summary
One-line description of what this alert means.

### Impact
- What user-facing functionality is affected?
- How many clinics/patients could be impacted?
- Is there a workaround?

### Diagnosis Steps
1. Check [dashboard link]
2. Run [diagnostic command]
3. Review [recent changes]
4. Check [dependency status]

### Resolution Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Escalation
- If unresolved after [time], escalate to [person/team]
- Contact [vendor] if [condition]

### Related
- Similar alerts: [links]
- Postmortems: [links]
- Architecture docs: [links]
```

#### 8.4.2 Runbook Repository Structure

```
/runbooks
├── /infrastructure
│   ├── database/
│   │   ├── postgres-primary-down.md
│   │   ├── postgres-replica-lag.md
│   │   ├── postgres-connections-exhausted.md
│   │   ├── postgres-lock-contention.md
│   │   └── postgres-disk-full.md
│   ├── kubernetes/
│   │   ├── pod-crash-loop.md
│   │   ├── node-not-ready.md
│   │   ├── pvc-full.md
│   │   ├── ingress-failure.md
│   │   └── hpa-not-scaling.md
│   ├── networking/
│   │   ├── dns-resolution-failure.md
│   │   ├── ssl-certificate-expired.md
│   │   ├── latency-spike.md
│   │   └── ddos-mitigation.md
│   └── storage/
│       ├── s3-bucket-full.md
│       ├── ebs-volume-full.md
│       └── backup-failure.md
├── /mri-pipeline
│   ├── gpu-worker-failure.md
│   ├── segmentation-accuracy-degradation.md
│   ├── dicom-corruption-detection.md
│   ├── registration-failure.md
│   └── queue-backlog-resolution.md
├── /qeeg-pipeline
│   ├── artifact-removal-failure.md
│   ├── ica-convergence-timeout.md
│   ├── channel-mapping-error.md
│   └── spectral-analysis-error.md
├── /evidence-db
│   ├── ingestion-stalled.md
│   ├── elasticsearch-red-cluster.md
│   ├── citation-sync-failure.md
│   └── search-latency-spike.md
├── /ai-ml
│   ├── model-drift-detected.md
│   ├── inference-latency-regression.md
│   ├── gpu-xid-error.md
│   └── batch-prediction-failure.md
├── /security
│   ├── suspected-breach.md
│   ├── certificate-compromise.md
│   ├── unusual-access-pattern.md
│   └── phi-exposure-risk.md
└── /cost
    ├── cost-spike-investigation.md
    ├── gpu-optimization-needed.md
    └── storage-growth-mitigation.md
```

### 8.5 Escalation Policies

#### 8.5.1 Escalation Timeline

```
CRITICAL Alert Escalation:

T+0 min    ──▶ Alert fires
           ──▶ PagerDuty page to primary on-call
           ──▶ Slack #incidents thread created
           ──▶ Auto-runbook link posted
           
T+5 min    ──▶ If unacknowledged:
           ──▶ Escalate to secondary on-call
           ──▶ SMS to both on-calls
           
T+10 min   ──▶ If unacknowledged:
           ──▶ Phone call to primary on-call
           ──▶ Escalate to team lead
           
T+15 min   ──▶ If unacknowledged:
           ──▶ Phone call to team lead
           ──▶ Escalate to engineering manager
           ──▶ Post to executive Slack channel
           
T+30 min   ──▶ If unresolved:
           ──▶ Auto-initiate incident bridge
           ──▶ Notify CTO
           ──▶ Consider vendor escalation (AWS, GCP)
           
T+1 hour   ──▶ If unresolved:
           ──▶ Executive briefing initiated
           ──▶ Customer communication prepared
           ──▶ War room activated
```

#### 8.5.2 Escalation Policies by Domain

| Domain | Primary | Secondary | Team Lead | Engineering Manager | Executive |
|--------|---------|-----------|-----------|---------------------|-----------|
| Platform Infra | Platform Eng | SRE | SRE Lead | VP Engineering | CTO |
| AI/ML Pipeline | ML Eng | ML Eng Senior | ML Lead | VP Engineering | CTO |
| Clinical Pipeline | Clinical Eng | Platform Eng | Clinical Lead | VP Product | CMO |
| Security | Security Eng | Security Lead | CISO | CEO | Board (if breach) |
| Cost/Finance | Platform Eng | Finance Ops | CFO + Eng Lead | CFO + CTO | CEO |

### 8.6 On-Call Rotation

#### 8.6.1 Rotation Structure

```yaml
on_call_rotation:
  platform_engineering:
    teams:
      - name: "US-East"
        timezone: "America/New_York"
        members: ["eng1", "eng2", "eng3", "eng4"]
        rotation_type: "weekly"
        handoff_day: "monday"
        handoff_time: "09:00"
        
      - name: "EU-Central"
        timezone: "Europe/Berlin"
        members: ["eng5", "eng6", "eng7", "eng8"]
        rotation_type: "weekly"
        handoff_day: "monday"
        handoff_time: "09:00"
        
      - name: "APAC"
        timezone: "Asia/Singapore"
        members: ["eng9", "eng10", "eng11", "eng12"]
        rotation_type: "weekly"
        handoff_day: "monday"
        handoff_time: "09:00"
        
    escalation:
      primary: "current_rotation_owner"
      secondary: "next_in_rotation"
      team_lead: "sre_team_lead"
      
  ml_engineering:
    timezone_coverage: "follow-the-sun with US primary"
    members: ["ml1", "ml2", "ml3", "ml4"]
    rotation_type: "weekly"
    escalation:
      primary: "ml_oncall"
      secondary: "ml_senior"
      team_lead: "ml_team_lead"
      
  clinical_engineering:
    timezone_coverage: "US business hours + EU overlap"
    members: ["clin1", "clin2", "clin3"]
    rotation_type: "weekly"
    # Clinical alerts only during business hours unless critical
```

#### 8.6.2 On-Call Compensation & Well-being

| Policy | Detail |
|--------|--------|
| On-call stipend | Flat weekly rate + per-page bonus |
| Maximum consecutive weeks | 1 week primary, then 3 weeks off |
| Handoff procedure | Written handoff doc + 15 min sync |
| Post-on-call day | Half-day recovery if 2+ pages |
| Training requirement | Shadow on-call for 2 weeks before first rotation |
| Backup coverage | Every primary has designated backup |
| Holiday coverage | Volunteers + 2x compensation |

---

## 9. SRE Best Practices

Site Reliability Engineering principles guide the platform's approach to reliability, scalability, and operational excellence.

### 9.1 SLOs and SLIs

Service Level Objectives (SLOs) define the reliability targets. Service Level Indicators (SLIs) are the measurable metrics that determine whether SLOs are met.

#### 9.1.1 SLI Definitions

| SLI Category | SLI Name | Measurement Method | Aggregation |
|-------------|----------|-------------------|-------------|
| **Availability** | API Uptime | Synthetic probe success rate | Per-minute, then monthly aggregate |
| **Availability** | Pipeline Completion Rate | Successful analyses / Total submitted | Per-hour, then monthly aggregate |
| **Latency** | API Response Time | HTTP request duration from API gateway | Histogram buckets, report percentiles |
| **Latency** | Analysis Processing Time | Time from submission to report ready | Per-analysis-type percentiles |
| **Quality** | Model Output Accuracy | Dice score, AUC, correlation vs. ground truth | Rolling 30-day average |
| **Quality** | Evidence Index Freshness | Age of most recently indexed paper | Maximum age in hours |
| **Durability** | Data Retention Compliance | Data retained per regulatory requirement | Audit scan |
| **Durability** | Backup Success Rate | Successful backups / Total scheduled | Per-backup-type |

#### 9.1.2 SLO Definitions

| Service | SLO | SLI | Measurement Window | Error Budget |
|---------|-----|-----|-------------------|-------------|
| API Availability | 99.95% | Uptime (probes) | 30 days | 21.6 min downtime |
| API Latency (P95) | < 500ms | Response time P95 | 7 days | 5% of requests may exceed |
| MRI Pipeline Success | 99.5% | Completion rate | 30 days | 0.5% may fail |
| qEEG Pipeline Success | 99.5% | Completion rate | 30 days | 0.5% may fail |
| MRI Latency (P95) | < 20 min | Analysis completion time | 7 days | 5% may exceed |
| qEEG Latency (P95) | < 10 min | Analysis completion time | 7 days | 5% may exceed |
| Evidence Ingestion | 95% of papers indexed within 48h | Ingestion freshness | 7 days | 5% may be delayed |
| Search Latency (P95) | < 500ms | Query response time | 7 days | 5% may exceed |
| Data Durability | 99.999999999% (11 9s) | Object durability | Annual | ~0 objects lost |
| Backup Success | 99.9% | Backup completion | 30 days | 0.1% may fail |

#### 9.1.3 SLO Dashboard

```
SLO Dashboard Layout:

┌─────────────────────────────────────────────────────────────────────┐
│  SLO STATUS OVERVIEW                          [Last 30 Days]       │
│                                                                      │
│  API Availability        ████████████████████░░░░  99.95%  ✅ SLO Met│
│  MRI Pipeline Success    ████████████████████░░░░  99.7%   ✅ SLO Met│
│  qEEG Pipeline Success   █████████████████████░░░  99.8%   ✅ SLO Met│
│  API Latency P95         ████████████████████░░░░  380ms   ✅ SLO Met│
│  MRI Latency P95         ███████████████████░░░░░  18.2min ✅ SLO Met│
│  Evidence Freshness      ████████████████████░░░░  99.2%   ✅ SLO Met│
│  Backup Success          █████████████████████░░░  100%    ✅ SLO Met│
│                                                                      │
│  Error Budget Remaining:                                             │
│  API Availability:        18.3 minutes remaining (85% used)         │
│  MRI Pipeline:            0.2% failures remaining (60% used)         │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  TRENDING                                                            │
│                                                                      │
│  API Latency P95 (7d trend)  ════════════════════════  stable        │
│  MRI Success Rate (30d trend)  ▁▂▄▆▇███▇▆▄▂▁  improving              │
│  Evidence Freshness (7d trend)  ════════▁▂▄▅  slight degradation     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Error Budgets

Error budgets quantify how much unreliability is acceptable before taking corrective action.

#### 9.2.1 Error Budget Policy

```yaml
error_budget_policy:
  calculation:
    method: "1 - SLO = error_budget"
    window: "30_days_rolling"
    
  consumption_tracking:
    api_availability:
      slo: 0.9995  # 99.95%
      budget_30d: "21.6 minutes"
      burn_rate_alerts:
        - name: "Fast Burn"
          rate: "14x"  # Would exhaust budget in 2 days
          condition: "2% budget consumed in 1 hour"
          action: "page on-call"
          
        - name: "Slow Burn"
          rate: "2x"   # Would exhaust budget in 15 days
          condition: "5% budget consumed in 12 hours"
          action: "warning ticket"
  
  budget_exhaustion_actions:
    at_50_percent:
      action: "Notify team lead, review recent changes"
      
    at_75_percent:
      action: "Freeze non-critical deployments"
      "notify_engineering_manager": true
      
    at_100_percent:
      action: "Freeze all deployments until SLO recovers"
      "prioritize_reliability_work": true
      "escalate_to": "VP Engineering"
      
    over_100_percent:
      action: "Emergency reliability sprint"
      "no_feature_work": true
      "daily_review": true
```

#### 9.2.2 Burn Rate Alerting

```promql
# Fast burn: 2% of monthly budget in 1 hour
(
  sum(rate(api_request_errors_total[1h])) 
  / sum(rate(api_request_total[1h]))
) > (1 - 0.9995) * 14  # 14x burn rate

# Slow burn: 5% of monthly budget in 6 hours
(
  sum(rate(api_request_errors_total[6h])) 
  / sum(rate(api_request_total[6h]))
) > (1 - 0.9995) * 6   # 6x burn rate
```

### 9.3 Blameless Postmortems

Every significant incident results in a blameless postmortem focused on systemic improvements.

#### 9.3.1 Postmortem Process

```
Incident → Resolution → Postmortem Timeline:

T+0 (Incident resolved)
  ├── Incident commander writes initial summary
  ├── Postmortem draft created from incident timeline
  └── Data collection begins (logs, metrics, traces)

T+24 hours
  ├── Postmortem document draft complete
  ├── Root cause analysis complete
  ├── Action items identified with owners
  └── Severity classification confirmed

T+48 hours
  ├── Postmortem review meeting (30 min max)
  ├── All stakeholders review draft
  ├── Action items prioritized
  └── Postmortem published internally

T+1 week
  ├── Action item progress check
  └── Update postmortem with progress

T+30 days
  ├── All action items completed or re-prioritized
  └── Postmortem closed
```

#### 9.3.2 Postmortem Template

```markdown
# Postmortem: [Incident Title]

## Metadata
- **Incident ID:** INC-2025-XXXX
- **Date:** YYYY-MM-DD
- **Severity:** [P1/P2/P3]
- **Duration:** HH:MM:SS
- **Status:** Resolved
- **Reporter:** Name
- **Reviewers:** Names

## Summary
2-3 sentence summary of what happened and impact.

## Impact
- **Services affected:** List
- **Clinics affected:** Count + names if < 10
- **Patient studies delayed:** Count
- **Data loss:** None / Describe
- **Financial impact:** Estimate if significant

## Timeline
| Time (UTC) | Event | Source |
|-----------|-------|--------|
| 08:00:00 | First alert fired | PagerDuty |
| 08:05:00 | On-call acknowledged | PagerDuty |
| 08:15:00 | Root cause identified | Engineer investigation |
| 08:30:00 | Mitigation applied | Deployment log |
| 08:45:00 | Service fully recovered | Health checks |

## Root Cause Analysis
### 5 Whys
1. Why did the service fail? → ...
2. Why did that happen? → ...
3. Why did that happen? → ...
4. Why did that happen? → ...
5. Why did that happen? → Root cause

### Contributing Factors
- Factor 1
- Factor 2

## Lessons Learned
### What went well
- Detection was fast
- Runbook was accurate

### What went poorly
- Escalation took too long
- Monitoring gap identified

### Where we got lucky
- Issue happened during business hours
- No data loss

## Action Items
| ID | Action | Owner | Priority | Due Date | Status |
|----|--------|-------|----------|----------|--------|
| AI-1 | Add monitoring for X | Name | P0 | YYYY-MM-DD | Open |
| AI-2 | Update runbook for Y | Name | P1 | YYYY-MM-DD | Open |

## Appendix
- Relevant logs
- Grafana dashboards
- Jira tickets
```

#### 9.3.3 Postmortem Culture Guidelines

| Principle | Description |
|-----------|-------------|
| Blameless | Focus on system failures, not human error |
| Psychological safety | No punishment for mistakes or outages |
| Learning-oriented | Every incident is a learning opportunity |
| Actionable | Every postmortem has at least 2 action items |
| Transparent | Postmortems are shared across engineering |
| Timely | Completed within 48 hours of resolution |
| Measured | Track time-to-detection, time-to-resolution, action item completion |

### 9.4 Chaos Engineering

Chaos engineering validates system resilience by injecting controlled failures.

#### 9.4.1 Chaos Experiment Framework

```yaml
chaos_experiments:
  infrastructure:
    - name: "api_pod_failure"
      description: "Randomly terminate API server pods"
      frequency: "weekly"
      scope: "staging"
      target: "20% of API pods"
      expected_behavior: "Traffic rerouted, 502s briefly, full recovery < 30s"
      abort_conditions: ["error_rate > 5%", "latency_p99 > 5s"]
      
    - name: "database_failover"
      description: "Trigger database primary failover"
      frequency: "monthly"
      scope: "staging (quarterly in prod)"
      expected_behavior: "Read-only for < 10s, automatic promotion of replica"
      abort_conditions: ["failover_time > 60s", "data_loss > 0"]
      
    - name: "network_partition"
      description: "Simulate AZ network partition"
      frequency: "monthly"
      scope: "staging"
      expected_behavior: "Services in healthy AZ continue, degraded capacity"
      abort_conditions: ["complete_outage", "data_loss"]
      
    - name: "gpu_node_failure"
      description: "Terminate GPU worker nodes"
      frequency: "weekly"
      scope: "staging"
      target: "1 GPU node"
      expected_behavior: "Jobs migrate to other nodes, queue depth temporarily increases"
      abort_conditions: ["jobs_failed > 10%", "queue_depth > 100 for > 10m"]
      
  application:
    - name: "memory_pressure"
      description: "Gradually increase memory pressure on services"
      frequency: "biweekly"
      scope: "staging"
      expected_behavior: "Graceful degradation, OOM kills trigger restarts"
      
    - name: "latency_injection"
      description: "Add latency to database queries"
      frequency: "weekly"
      scope: "staging"
      expected_behavior: "Circuit breakers trip, fallback behavior activates"
      
  dependency:
    - name: "external_api_failure"
      description: "Simulate PubMed/ Crossref outage"
      frequency: "weekly"
      scope: "staging"
      expected_behavior: "Evidence search uses cached data, ingestion pauses gracefully"
      abort_conditions: ["platform_errors", "data_corruption"]
```

#### 9.4.2 Chaos Engineering Tools

| Tool | Purpose | Target |
|------|---------|--------|
| Chaos Mesh | Kubernetes chaos (pod kills, network partition) | K8s workloads |
| Gremlin | General chaos (CPU, memory, network, IO) | VMs, containers |
| Toxiproxy | Network latency/packet loss simulation | Service dependencies |
| Litmus | Cloud-native chaos workflows | K8s + cloud resources |
| Custom scripts | Domain-specific failures (GPU eviction, DB failover) | Platform-specific |

### 9.5 Capacity Planning

Capacity planning ensures sufficient resources are available before they're needed.

#### 9.5.1 Capacity Planning Framework

```
Capacity Planning Process:

┌──────────────────────────────────────────────────────────────┐
│ 1. DATA COLLECTION                                            │
│    - Historical utilization (CPU, memory, GPU, storage)      │
│    - Growth trends (weekly, monthly)                         │
│    - Seasonal patterns (conference season, holidays)         │
│    - New clinic onboarding schedule                          │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. PROJECTION                                                │
│    - Linear regression on growth trends                      │
│    - Account for planned new features                        │
│    - Headroom buffer (30% minimum)                           │
│    - Scenario modeling (best/expected/worst case)            │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. DECISION                                                  │
│    - Scale now vs. later                                     │
│    - Vertical vs. horizontal scaling                         │
│    - Reserved instances vs. on-demand                        │
│    - New region deployment needed?                           │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. EXECUTION                                                 │
│    - Infrastructure changes (IaC)                            │
│    - Performance validation                                  │
│    - Cost impact analysis                                    │
│    - Documentation update                                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. REVIEW                                                    │
│    - Actual vs. projected utilization                        │
│    - Cost efficiency review                                  │
│    - Plan adjustment for next cycle                          │
└──────────────────────────────────────────────────────────────┘
```

#### 9.5.2 Capacity Triggers

| Resource | Scale-Up Trigger | Scale-Down Trigger | Lead Time |
|----------|-----------------|-------------------|-----------|
| GPU nodes | Utilization > 70% avg for 1h | < 30% for 4h | 5 minutes (auto) |
| API servers | CPU > 60% or latency > SLO | CPU < 20% for 2h | 2 minutes (auto) |
| Database | Connections > 70% or CPU > 60% | N/A | 1 week (manual) |
| Storage | > 70% capacity | N/A | 1 month (manual) |
| Elasticsearch | JVM > 70% or disk > 75% | N/A | 1 week (manual) |
| Redis | Memory > 70% | < 30% for 1h | 1 day (manual) |

#### 9.5.3 Quarterly Capacity Review

```markdown
## Quarterly Capacity Review Template

### Current State (as of [Date])
| Resource | Current Capacity | Utilization | Headroom | Trend |
|----------|-----------------|-------------|----------|-------|
| GPU cluster | 20 A100s | 45% avg | 55% | +15%/quarter |
| API servers | 20 c6i.2xlarge | 30% avg | 70% | +10%/quarter |
| PostgreSQL | db.r6g.4xlarge | 25% CPU | 75% | +5%/quarter |
| S3 storage | 150 TB | 78% | 22% | +25 TB/quarter |
| Elasticsearch | 6 nodes | 40% JVM | 60% | +8%/quarter |

### Growth Drivers
1. New clinic onboarding: [N] clinics × [M] studies/month
2. New features: [Feature] adds [X] compute per study
3. Data retention: [Y] months additional retention required

### Projections (6 months)
| Resource | Projected Need | Gap | Action Required |
|----------|---------------|-----|-----------------|
| GPU | 28 A100s | +8 | Order reserved instances |
| Storage | 220 TB | +70 TB | Expand + lifecycle policy update |

### Recommendations
1. [Action item with owner and timeline]
2. [Action item with owner and timeline]
```

### 9.6 Disaster Recovery

Disaster recovery ensures business continuity in the face of catastrophic failures.

#### 9.6.1 DR Architecture

```
Multi-Region Architecture:

┌─────────────────────────────────────────────────────────────────┐
│                     PRIMARY REGION                              │
│                    (us-east-1)                                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   EKS Cluster│  │  RDS Primary │  │  S3 Primary  │         │
│  │  (Active)    │  │  (Read/Write)│  │  (Read/Write)│         │
│  │              │  │              │  │              │         │
│  │ API servers  │  │ PostgreSQL   │  │ DICOM/NIfTI  │         │
│  │ GPU workers  │  │ Read replicas│  │ Reports      │         │
│  │ Celery workers│ │ Elasticsearch│  │ Backups      │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│         │                 │                 │                  │
│         │                 │ Replication     │ Cross-region     │
│         │                 │ (streaming)    │ replication      │
│         │                 │                 │                  │
│         ▼                 ▼                 ▼                  │
├─────────────────────────────────────────────────────────────────┤
│                     STANDBY REGION                              │
│                    (us-west-2)                                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   EKS Cluster│  │  RDS Standby │  │  S3 Replica  │         │
│  │  (Warm)      │  │  (Read only) │  │  (Read only) │         │
│  │              │  │              │  │              │         │
│  │ API servers  │  │ PostgreSQL   │  │ Full replica │         │
│  │ (scaled: 0)  │  │ (replica)    │  │ of primary   │         │
│  │ GPU workers  │  │ Elasticsearch│  │              │         │
│  │ (scaled: 0)  │  │ (replica)    │  │              │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

#### 9.6.2 Recovery Objectives

| Service | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|---------|------------------------------|-------------------------------|
| API Platform | 15 minutes | 0 (synchronous replication) |
| MRI Pipeline | 30 minutes | 5 minutes |
| qEEG Pipeline | 30 minutes | 5 minutes |
| Evidence Search | 1 hour | 1 hour |
| Evidence Ingestion | 4 hours | 4 hours |
| Report Generation | 15 minutes | 0 |
| Patient Data | 15 minutes | 0 (synchronous) |
| Authentication | 5 minutes | 0 (multi-region active) |

#### 9.6.3 DR Procedures

```yaml
disaster_recovery:
  activation_triggers:
    - primary_region_unavailable: "> 5 minutes"
    - data_corruption_in_primary: "confirmed by automated checks"
    - security_incident_in_primary: "CISO decision"
    - regulatory_requirement: "data residency requirement change"
    
  failover_procedure:
    steps:
      1: "Confirm primary region failure via external probes"
      2: "Notify incident commander and executive team"
      3: "Promote RDS standby to primary"
      4: "Activate S3 replica for writes"
      5: "Scale up EKS cluster in standby region"
      6: "Update DNS to point to standby region"
      7: "Verify health checks pass"
      8: "Notify clinics of service restoration"
      9: "Begin post-incident review"
      
    estimated_time: "15 minutes (automated), 30 minutes (manual)"
    
  failback_procedure:
    steps:
      1: "Verify primary region stability for 24 hours"
      2: "Sync any new data from standby to primary"
      3: "Promote RDS back to primary region"
      4: "Switch S3 writeback to primary"
      5: "Gradually shift traffic back"
      6: "Scale down standby region"
      7: "Verify all systems operational"
      
  testing:
    frequency: "quarterly"
    scope: "full failover and failback"
    notification: "48 hours advance notice to clinics"
    success_criteria:
      - "RTO met for all critical services"
      - "Zero data loss verified"
      - "All clinics can access platform"
```

#### 9.6.4 Backup Strategy

| Data Type | Backup Method | Frequency | Retention | Recovery Test |
|-----------|--------------|-----------|-----------|---------------|
| PostgreSQL | RDS automated + logical | Daily (automated), Hourly (WAL) | 35 days | Monthly restore test |
| Elasticsearch | Snapshot to S3 | Hourly incremental, Daily full | 30 days | Monthly restore test |
| Redis | RDB snapshot + AOF | Every 6 hours | 7 days | Quarterly restore test |
| S3 (DICOM/NIfTI) | Cross-region replication + versioning | Continuous | 7 years | Quarterly integrity check |
| Application config | Git + Terraform state | Every change | Indefinite | N/A (immutable) |
| Kubernetes state | Velero snapshots | Daily | 30 days | Quarterly restore test |

---

## 10. Dashboard Wireframes & Specifications

### 10.1 Executive Dashboard

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DEEPSYNAPS PLATFORM HEALTH                         🟢 All Systems Healthy │
│  Last updated: 2025-01-21 14:32 UTC                                         │
├──────────────────────────────┬───────────────────────────────────────────────┤
│                              │                                               │
│  PLATFORM SLOs               │  PIPELINE HEALTH                              │
│  ─────────────               │  ─────────────                                │
│                              │                                               │
│  API Uptime        99.97% ✅ │  MRI Pipeline      ████████░░ 99.7%  ✅      │
│  API Latency P95    320ms ✅ │  qEEG Pipeline     ████████░░ 99.8%  ✅      │
│  MRI Success        99.7% ✅ │  Evidence Fresh    ████████░░ 99.2%  ✅      │
│  qEEG Success       99.8% ✅ │  Backup Status     ██████████ 100%   ✅      │
│                              │                                               │
│  Error Budget (API)          │  Active Analyses                              │
│  ████████████████░░ 85% used │  MRI: 47 processing    qEEG: 32 processing   │
│                              │  Queue depths: All nominal                    │
├──────────────────────────────┼───────────────────────────────────────────────┤
│                              │                                               │
│  INFRASTRUCTURE              │  AI/ML HEALTH                                 │
│  ─────────────               │  ───────────                                  │
│                              │                                               │
│  CPU Util (avg)     34%      │  Model Accuracy                               │
│  Memory Util (avg)  42%      │  MRI Seg Dice:  0.93 ✅                       │
│  GPU Util (avg)     56%      │  Brain Age MAE:  3.2y ✅                      │
│  Storage Used       68%      │  qEEG F1:       0.95 ✅                       │
│  DB Connections     23/50    │  Evidence NDCG: 0.82 ✅                       │
│                              │                                               │
│  [Infrastructure Details →]  │  GPU Cluster: 14/20 active, 0 errors         │
│                              │                                               │
├──────────────────────────────┴───────────────────────────────────────────────┤
│                                                                              │
│  COST OVERVIEW (MTD)                                                         │
│  ─────────────────────                                                       │
│                                                                              │
│  Total: $24,500  │  Compute: $12,300  │  Storage: $4,200  │  GPU: $6,800   │
│  Budget: $30,000  │  On track (82%)  │  Projected: $28,200                       │
│                                                                              │
│  Top 3 Clinics by Cost:  Clinic #1842 ($2,100) │ Clinic #0521 ($1,800) │ Clinic #9301 ($1,650) │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Operations Dashboard (SRE)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SRE OPERATIONS CENTER                                    [Auto-refresh: 10s]│
├──────────────────────────────┬───────────────────────────────────────────────┤
│                              │                                               │
│  ACTIVE ALERTS               │  KUBERNETES CLUSTER                           │
│  ─────────────               │  ────────────────                             │
│                              │                                               │
│  🔴 CRIT: GPU node gpu-07    │  Nodes:  24/24 Ready                          │
│     XID 48, auto-evacuating  │  Pods:   156/160 Running, 2 Pending           │
│     [Runbook] [Ack] [Mute]   │  CPU:    45% avg                              │
│                              │  Memory: 52% avg                              │
│  🟡 WARN: DB replica-2 lag   │  GPU:    14/20 Allocated                      │
│     45s behind primary       │                                               │
│     [Runbook] [Ack]          │  [Cluster Details →]                          │
│                              │                                               │
│  🟡 WARN: S3 growth +35%     ├───────────────────────────────────────────────┤
│     vs. last week            │                                               │
│     [Investigate]            │  QUEUE STATUS                                 │
│                              │  ───────────                                  │
├──────────────────────────────┤                                               │
│                              │  mri.analysis    ████░░░░░░  8 jobs, 4 workers│
│  NETWORK                     │  qeeg.process    ██░░░░░░░░  3 jobs, 3 workers│
│  ───────                     │  report.generate ████████░░  23 jobs, 6 workers│
│                              │  evidence.sync   ██████████  124 jobs queued  │
│  Latency P50:    45ms        │  patient.alert   ░░░░░░░░░░  0 jobs (clear)   │
│  Latency P95:   180ms        │                                               │
│  Latency P99:   420ms        │  [Queue Details →]                            │
│  Error rate:   0.02%         │                                               │
│  SSL:          23 days       ├───────────────────────────────────────────────┤
│  DNS:          Healthy       │                                               │
│                              │  DATABASE                                     │
│  [Network Details →]         │  ────────                                     │
│                              │                                               │
├──────────────────────────────┤  Primary:  Healthy, 23 connections            │
│                              │  Replicas: 2/2 healthy, max lag 12s           │
│  INCIDENTS (7d)              │  Storage:  342 GB / 500 GB                    │
│  ──────────────              │  Slow queries: 3/min (threshold: 20)          │
│                              │                                               │
│  INC-2025-0042  2025-01-19   │  [DB Details →]                               │
│  GPU OOM during batch job    │                                               │
│  Status: Resolved ✅         ├───────────────────────────────────────────────┤
│                              │                                               │
│  INC-2025-0041  2025-01-18   │  ON-CALL                                      │
│  DB replica sync delay       │  ──────                                       │
│  Status: Resolved ✅         │                                               │
│                              │  Primary:  Alex Chen (US-East)                │
│  [View All Incidents →]      │  Secondary: Jordan Park (EU-Central)          │
│                              │  Escalation: Priya Sharma (Lead)              │
│                              │                                               │
│                              │  [Rotation Schedule →]                          │
│                              │                                               │
└──────────────────────────────┴───────────────────────────────────────────────┘
```

### 10.3 AI/ML Pipeline Dashboard

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  AI/ML PIPELINE MONITORING                              [Auto-refresh: 30s]  │
├──────────────────────────────┬───────────────────────────────────────────────┤
│                              │                                               │
│  INFERENCE VOLUME (24h)      │  MODEL LATENCY DISTRIBUTION                   │
│  ──────────────────          │  ────────────────────────                     │
│                              │                                               │
│  2.4K requests               │  MRI Seg (T1)   P50: 45s  P95: 92s  P99: 118s│
│  ▁▂▄▅▆▇█████▇▆▄▂▁           │  MRI Seg (T2)   P50: 62s  P95: 125s P99: 168s│
│  Peak: 180 req/hr at 14:00   │  Brain Age      P50: 32s  P95: 65s  P99: 89s │
│  ▲ +12% vs yesterday         │  qEEG Artifact  P50: 15s  P95: 31s  P99: 42s │
│                              │  qEEG Spectral  P50: 12s  P95: 24s  P99: 35s │
│  [Volume Details →]          │  Evidence Rank  P50: 89ms P95: 234ms P99: 520ms│
│                              │                                               │
├──────────────────────────────┤  [Latency Trends →]                           │
│                              │                                               │
│  GPU CLUSTER STATUS          ├───────────────────────────────────────────────┤
│  ─────────────────           │                                               │
│                              │  MODEL ACCURACY                               │
│  GPU-01  A100  ████████░░ 78%│  ─────────────                                │
│  GPU-02  A100  ██████░░░░ 62%│                                               │
│  GPU-03  A100  █████████░ 89%│  ┌─────────┬──────────┬──────────┬────────┐  │
│  GPU-04  A100  ██████░░░░ 58%│  │ Model   │ Current  │ Baseline │ Status │  │
│  GPU-05  T4    ████░░░░░░ 45%│  ├─────────┼──────────┼──────────┼────────┤  │
│  GPU-06  T4    █████░░░░░ 52%│  │MRI Dice │ 0.93     │ 0.92     │ ✅ +1% │  │
│  GPU-07  T4    🔴 EVACUATING │  │BrainAge │ 3.2y MAE │ 3.5y MAE │ ✅ -9% │  │
│  GPU-08  T4    █████░░░░░ 51%│  │qEEG F1  │ 0.95     │ 0.94     │ ✅ +1% │  │
│  GPU-09-14 (standby)         │  │Risk AUC │ 0.89     │ 0.88     │ ✅ +1% │  │
│                              │  │Evidence  │ 0.82     │ 0.80     │ ✅ +3% │  │
│  Temp: 68°C avg (normal)     │  └─────────┴──────────┴──────────┴────────┘  │
│  Memory: 72% avg             │                                               │
│  Errors: 1 (GPU-07 XID 48)   │  [Drift Analysis →]                           │
│                              │                                               │
│  [GPU Details →]             ├───────────────────────────────────────────────┤
│                              │                                               │
├──────────────────────────────┤  A/B TESTS ACTIVE                             │
│                              │  ────────────────                             │
│  INPUT/OUTPUT VALIDATION     │                                               │
│  ─────────────────────       │  ┌──────────┬────────┬────────┬──────────┐   │
│                              │  │ Test     │ Split  │ Status │ Decision │   │
│  MRI Validation:             │  ├──────────┼────────┼────────┼──────────┤   │
│  Pass: 99.7% (1,247/1,251)  │  │seg-v2.1  │ 10%    │ ✅ Continue│ Auto   │   │
│  Flagged: 0.2% (3)           │  │age-v1.5  │ 15%    │ ✅ Continue│ Manual │   │
│  Rejected: 0.1% (1)          │  │qeeg-art  │ 20%    │ ⏸️ Paused  │ Review │   │
│                              │  └──────────┴────────┴────────┴──────────┘   │
│  qEEG Validation:            │                                               │
│  Pass: 99.5% (892/896)       │  [Test Details →]                             │
│  Flagged: 0.3% (3)           │                                               │
│  Rejected: 0.2% (2)          │                                               │
│                              │                                               │
└──────────────────────────────┴───────────────────────────────────────────────┘
```

### 10.4 Cost Dashboard

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  COST ANALYSIS CENTER                                 Period: Jan 1-21, 2025 │
├──────────────────────────────┬───────────────────────────────────────────────┤
│                              │                                               │
│  MONTH-TO-DATE COST          │  COST BY SERVICE                              │
│  ──────────────────          │  ───────────────                              │
│                              │                                               │
│  $24,500.00                  │  GPU Compute    ████████████░░ $6,800  28%    │
│  Budget: $30,000             │  CPU Compute    █████████░░░░░ $5,200  21%    │
│  Projected: $28,200          │  Storage        ██████░░░░░░░░ $4,200  17%    │
│                              │  Database       ████░░░░░░░░░░ $3,100  13%    │
│  [███████░░░░░░░░] 82%       │  Network        ███░░░░░░░░░░░ $2,400   10%   │
│                              │  External APIs  ██░░░░░░░░░░░░ $1,500    6%   │
│  vs. Last Month: +8%         │  Observability  █░░░░░░░░░░░░░ $800     3%    │
│  vs. Forecast: -6%           │  Other          █░░░░░░░░░░░░░ $500     2%    │
│                              │                                               │
│  [Cost Breakdown →]          │  [Service Details →]                          │
│                              │                                               │
├──────────────────────────────┼───────────────────────────────────────────────┤
│                              │                                               │
│  COST BY CLINIC (TOP 10)     │  GPU COST EFFICIENCY                          │
│  ──────────────────────      │  ───────────────────                          │
│                              │                                               │
│  #1842 NeuroHealth Clinic  $2,100 ████  MRI-heavy         │
│  #0521 Mindscape Center    $1,800 ███   Mixed            │  Cost/inf: $0.18 │
│  #9301 BrainScan Partners  $1,650 ███   qEEG-heavy       │  Target: $0.15   │
│  #0247 CNS Diagnostics     $1,400 ██    Balanced         │  Efficiency: 83% │
│  #7712 NeuroLab Institute  $1,200 ██    Research         │                  │
│  #3389 Pacific Neuro       $1,100 ██    MRI-heavy         │  [Optimization   │
│  #5012 Metro Mental Health  $950  █     Mixed            │   Opportunities] │
│  #6623 BrainHealth Austin  $820   █     qEEG-heavy       │                  │
│  #1197 Great Lakes Neuro   $780   █     Balanced         │                  │
│  #4456 Southeast Imaging   $650   ▌     MRI-heavy         │                  │
│                              │                                               │
│  [All Clinics →]             │                                               │
│                              │                                               │
├──────────────────────────────┤                                               │
│                              │                                               │
│  COST ANOMALIES              ├───────────────────────────────────────────────┤
│  ─────────────               │                                               │
│                              │  STORAGE GROWTH                               │
│  ⚠️ Clinic #1842: +45% vs    │  ─────────────                                │
│    30d avg ($2,100 vs $1,450)│                                               │
│    MRI volume spike detected │  Current: 156 TB                              │
│                              │  Growth: +23 TB this month (+17%)             │
│  ✅ All other clinics within │  Projected 90d: 210 TB                        │
│    normal variance           │  Capacity: 500 TB                             │
│                              │                                               │
│  [Investigate →]             │  [Storage Details →]                          │
│                              │                                               │
└──────────────────────────────┴───────────────────────────────────────────────┘
```

---

## 11. Appendix A: Alert Configuration Examples

### 11.1 Prometheus Alert Rules

```yaml
groups:
  # ============================================
  # INFRASTRUCTURE ALERTS
  # ============================================
  - name: infrastructure
    interval: 30s
    rules:
      - alert: APIHighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) 
          / sum(rate(http_requests_total[5m])) > 0.01
        for: 2m
        labels:
          severity: critical
          team: platform
          service: api
        annotations:
          summary: "API error rate > 1%"
          description: "Current error rate: {{ $value | humanizePercentage }}"
          runbook_url: "https://wiki.deepsynaps.io/runbooks/api-high-error-rate"
          dashboard: "https://grafana.deepsynaps.io/d/api-overview"
          
      - alert: APILatencyP95High
        expr: |
          histogram_quantile(0.95, 
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
          ) > 0.5
        for: 5m
        labels:
          severity: warning
          team: platform
          service: api
        annotations:
          summary: "API P95 latency > 500ms"
          description: "Current P95: {{ $value }}s"
          
      - alert: DatabaseConnectionsExhausted
        expr: |
          postgresql_connections_active / postgresql_connections_max > 0.85
        for: 2m
        labels:
          severity: critical
          team: platform
          service: database
        annotations:
          summary: "PostgreSQL connection pool > 85%"
          action: "Consider increasing max_connections or adding connection pooler"
          
      - alert: DatabaseReplicationLag
        expr: |
          pg_replication_lag_seconds > 60
        for: 3m
        labels:
          severity: warning
          team: platform
          service: database
        annotations:
          summary: "DB replication lag > 60 seconds"
          
      - alert: DiskSpaceCritical
        expr: |
          node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.10
        for: 1m
        labels:
          severity: critical
          team: platform
          service: storage
        annotations:
          summary: "Disk {{ $labels.mountpoint }} > 90% full"
          
      - alert: SSLCertificateExpiringSoon
        expr: |
          (ssl_certificate_not_after - time()) / 86400 < 14
        for: 1h
        labels:
          severity: warning
          team: platform
          service: security
        annotations:
          summary: "SSL cert for {{ $labels.instance }} expires in {{ $value }} days"

  # ============================================
  # MRI PIPELINE ALERTS
  # ============================================
  - name: mri_pipeline
    interval: 30s
    rules:
      - alert: MRIPipelineQueueBacklog
        expr: |
          celery_queue_length{queue="mri.analysis"} > 25
        for: 5m
        labels:
          severity: warning
          team: ml-platform
          service: mri-pipeline
        annotations:
          summary: "MRI analysis queue depth > 25"
          action: "Scale up GPU workers or investigate processing delays"
          
      - alert: MRIPipelineFailureRateHigh
        expr: |
          sum(rate(celery_task_failed_total{queue=~"mri.*"}[1h]))
          / sum(rate(celery_task_total{queue=~"mri.*"}[1h])) > 0.01
        for: 10m
        labels:
          severity: critical
          team: ml-platform
          service: mri-pipeline
        annotations:
          summary: "MRI pipeline failure rate > 1%"
          
      - alert: MRIPipelineLatencyP95High
        expr: |
          histogram_quantile(0.95,
            sum(rate(mri_processing_duration_seconds_bucket[1h])) by (le)
          ) > 1200
        for: 15m
        labels:
          severity: warning
          team: ml-platform
          service: mri-pipeline
        annotations:
          summary: "MRI pipeline P95 latency > 20 minutes"
          
      - alert: MRISegmentationAccuracyDecline
        expr: |
          mri_segmentation_dice_score:7d_mean < 0.90
        for: 1d
        labels:
          severity: warning
          team: ml-clinical
          service: mri-pipeline
        annotations:
          summary: "MRI segmentation 7d mean Dice < 0.90"
          action: "Review recent scans for protocol changes"
          
      - alert: GPUWorkerUnavailable
        expr: |
          celery_worker_up{queue="mri.analysis"} < 4
        for: 2m
        labels:
          severity: critical
          team: ml-platform
          service: gpu-cluster
        annotations:
          summary: "MRI GPU workers below minimum ({{ $value }} < 4)"

  # ============================================
  # QEEG PIPELINE ALERTS
  # ============================================
  - name: qeeg_pipeline
    interval: 30s
    rules:
      - alert: qEEGPipelineQueueBacklog
        expr: |
          celery_queue_length{queue="qeeg.process"} > 50
        for: 5m
        labels:
          severity: warning
          team: ml-platform
          service: qeeg-pipeline
        annotations:
          summary: "qEEG processing queue depth > 50"
          
      - alert: qEEGPipelineFailureRateHigh
        expr: |
          sum(rate(celery_task_failed_total{queue=~"qeeg.*"}[1h]))
          / sum(rate(celery_task_total{queue=~"qeeg.*"}[1h])) > 0.01
        for: 10m
        labels:
          severity: critical
          team: ml-platform
          service: qeeg-pipeline
        annotations:
          summary: "qEEG pipeline failure rate > 1%"

  # ============================================
  # AI/ML ALERTS
  # ============================================
  - name: ai_ml
    interval: 60s
    rules:
      - alert: ModelDriftDetected
        expr: |
          model_drift_score > 0.2
        for: 1d
        labels:
          severity: warning
          team: ml-clinical
          service: ml-models
        annotations:
          summary: "Data drift detected in {{ $labels.model_name }}"
          
      - alert: ModelAccuracyCriticalDecline
        expr: |
          model_accuracy_auc:30d_rolling < (model_accuracy_baseline - 0.05)
        for: 1d
        labels:
          severity: critical
          team: ml-clinical
          service: ml-models
        annotations:
          summary: "{{ $labels.model_name }} accuracy degraded > 5% from baseline"
          action: "Consider model rollback"
          
      - alert: GPUXIDError
        expr: |
          increase(dcgm_gpu_xid_errors[1h]) > 0
        labels:
          severity: critical
          team: ml-platform
          service: gpu-cluster
        annotations:
          summary: "GPU XID error on {{ $labels.gpu }}"
          
      - alert: GPUTemperatureHigh
        expr: |
          dcgm_gpu_temperature > 80
        for: 5m
        labels:
          severity: warning
          team: ml-platform
          service: gpu-cluster
        annotations:
          summary: "GPU {{ $labels.gpu }} temperature {{ $value }}°C"
          
      - alert: GPUUtilizationZero
        expr: |
          dcgm_gpu_utilization == 0
        for: 10m
        labels:
          severity: info
          team: ml-platform
          service: gpu-cluster
        annotations:
          summary: "GPU {{ $labels.gpu }} idle for 10 minutes"

  # ============================================
  # EVIDENCE DB ALERTS
  # ============================================
  - name: evidence_db
    interval: 300s
    rules:
      - alert: EvidenceIngestionStalled
        expr: |
          increase(evidence_papers_ingested_total[6h]) == 0
        for: 1h
        labels:
          severity: warning
          team: content
          service: evidence-db
        annotations:
          summary: "No papers ingested in past 6 hours"
          
      - alert: ElasticsearchClusterRed
        expr: |
          elasticsearch_cluster_health_status{color="red"} == 1
        for: 1m
        labels:
          severity: critical
          team: platform
          service: evidence-db
        annotations:
          summary: "Elasticsearch cluster status RED"
          
      - alert: SearchLatencyP95High
        expr: |
          histogram_quantile(0.95,
            sum(rate(elasticsearch_indices_search_query_time_seconds_bucket[5m])) by (le)
          ) > 0.5
        for: 10m
        labels:
          severity: warning
          team: platform
          service: evidence-db
        annotations:
          summary: "Evidence search P95 latency > 500ms"

  # ============================================
  # COST ALERTS
  # ============================================
  - name: cost
    interval: 3600s
    rules:
      - alert: DailyCostSpike
        expr: |
          (
            sum(daily_cloud_cost)
            / avg_over_time(sum(daily_cloud_cost)[7d:1d])
          ) > 2
        for: 1h
        labels:
          severity: info
          team: platform
          service: cost
        annotations:
          summary: "Daily cloud cost 2x above 7-day average"
          
      - alert: ClinicBudgetThreshold
        expr: |
          clinic_monthly_cost / clinic_monthly_budget > 0.9
        for: 1h
        labels:
          severity: warning
          team: finance
          service: billing
        annotations:
          summary: "Clinic {{ $labels.clinic_id }} at {{ $value | humanizePercentage }} of budget"
```

### 11.2 PagerDuty Service Configuration

```yaml
pagerduty_services:
  platform-critical:
    name: "DeepSynaps Platform Critical"
    escalation_policy: "platform-engineering-critical"
    urgency_rules:
      high_urgency: ["CRITICAL alerts"]
      low_urgency: ["WARNING alerts"]
    integrations:
      - prometheus_alertmanager
      - datadog
      - pingdom
      
  ml-pipeline:
    name: "DeepSynaps ML Pipeline"
    escalation_policy: "ml-engineering"
    auto_pause_transient: true
    
  clinical-pipeline:
    name: "DeepSynaps Clinical Pipeline"
    escalation_policy: "clinical-engineering"
    
  cost-alerts:
    name: "DeepSynaps Cost Alerts"
    escalation_policy: "platform-standard"
    notification_timeout: 3600  # 1 hour
```

---

## 12. Appendix B: SLO Definitions Table

### 12.1 Comprehensive SLO Reference

| # | Service | SLO Name | Target | SLI | Measurement Window | Error Budget |
|---|---------|----------|--------|-----|-------------------|-------------|
| 1 | API Platform | Availability | 99.95% | Successful probes / Total probes | 30 days | 21.6 min/month |
| 2 | API Platform | Latency P50 | < 100ms | HTTP response time 50th percentile | 7 days | 5% overage |
| 3 | API Platform | Latency P95 | < 500ms | HTTP response time 95th percentile | 7 days | 5% overage |
| 4 | API Platform | Error Rate | < 0.1% | 5xx responses / Total responses | 7 days | 5% overage |
| 5 | Auth Service | Availability | 99.99% | Login success rate | 30 days | 4.3 min/month |
| 6 | Auth Service | Latency P95 | < 200ms | Authentication response time | 7 days | 5% overage |
| 7 | MRI Pipeline | Success Rate | 99.5% | Completed / Submitted | 30 days | 0.5% failure |
| 8 | MRI Pipeline | Latency P50 | < 15 min | Upload to report ready | 7 days | 5% overage |
| 9 | MRI Pipeline | Latency P95 | < 30 min | Upload to report ready | 7 days | 5% overage |
| 10 | MRI Pipeline | Accuracy | Dice > 0.90 | Segmentation quality | 30 days | 2% degradation |
| 11 | qEEG Pipeline | Success Rate | 99.5% | Completed / Submitted | 30 days | 0.5% failure |
| 12 | qEEG Pipeline | Latency P50 | < 8 min | Upload to report ready | 7 days | 5% overage |
| 13 | qEEG Pipeline | Latency P95 | < 15 min | Upload to report ready | 7 days | 5% overage |
| 14 | qEEG Pipeline | Artifact F1 | > 0.92 | Artifact detection quality | 30 days | 2% degradation |
| 15 | Report Generation | Success Rate | 99.9% | Generated / Requested | 30 days | 0.1% failure |
| 16 | Report Generation | Latency P95 | < 2 min | Request to PDF ready | 7 days | 5% overage |
| 17 | Evidence DB | Ingestion Freshness | 95% within 48h | Papers indexed within 48h | 7 days | 5% delayed |
| 18 | Evidence DB | Search Availability | 99.9% | Successful searches / Total | 30 days | 43 min/month |
| 19 | Evidence DB | Search Latency P95 | < 500ms | Query response time | 7 days | 5% overage |
| 20 | AI/ML Models | Inference Availability | 99.9% | Successful inferences / Total | 30 days | 43 min/month |
| 21 | AI/ML Models | Inference Latency P95 | Model-specific | GPU compute time | 7 days | 5% overage |
| 22 | AI/ML Models | Accuracy Maintenance | Within 5% baseline | Rolling accuracy vs. baseline | 30 days | 5% drift |
| 23 | Data Storage | Durability | 99.999999999% | Objects confirmed intact | Annual | ~0 objects |
| 24 | Backup | Success Rate | 99.9% | Successful / Scheduled | 30 days | 0.1% failure |
| 25 | Backup | Recovery Time | < 4 hours | Time to restore from backup | Per event | None |
| 26 | GPU Cluster | Availability | 99.5% | GPU nodes operational | 30 days | 3.6 hrs/month |
| 27 | GPU Cluster | Utilization | 50-85% | Compute utilization | 7 days | None |
| 28 | Security | Incident Response | < 1 hour | Time to acknowledge security alert | Per event | None |
| 29 | Compliance | Audit Pass Rate | 100% | Audits passed / Audits conducted | Annual | 0 failures |
| 30 | Cost Efficiency | Budget Variance | Within 10% | Actual vs. budgeted spend | 30 days | 10% overage |

### 12.2 SLO Review Cadence

| Review Type | Frequency | Participants | Output |
|-------------|-----------|-------------|--------|
| SLO Health Check | Weekly | On-call engineer | Alert on budget consumption |
| SLO Trend Review | Monthly | Team lead + engineers | Adjust targets if needed |
| SLO Calibration | Quarterly | All stakeholders | Update SLOs, add/remove |
| Error Budget Review | Monthly | Product + Engineering | Prioritize reliability work |

---

## 13. Appendix C: Runbook Templates

### 13.1 Runbook: MRI Pipeline Failure

```markdown
# Runbook: MRI Pipeline Failure

**Alert:** MRIPipelineFailureRateHigh  
**Severity:** CRITICAL  
**Service:** MRI Pipeline  
**Last Updated:** 2025-01-15

## Impact
- New MRI scans cannot be processed
- Clinics cannot access analysis reports
- Patient care may be delayed

## Diagnosis Steps

### Step 1: Check Pipeline Status
```bash
# Check queue depth
curl http://celery-monitor.internal/api/queues/mri.analysis

# Check active workers
celery -A deepsynaps inspect active --queue mri.analysis

# Check worker health
kubectl get pods -l app=mri-gpu-worker
```

### Step 2: Check GPU Cluster
```bash
# GPU utilization
kubectl exec -it gpu-node-01 -- nvidia-smi

# Check for XID errors
kubectl logs -l app=mri-gpu-worker | grep -i "xid\|error\|fail"

# GPU memory usage
kubectl top nodes -l gpu=true
```

### Step 3: Check Recent Deployments
```bash
# Recent deployments
kubectl rollout history deployment/mri-gpu-worker

# Recent config changes
kubectl get configmap mri-pipeline-config -o yaml | diff - previous.yaml
```

### Step 4: Check Storage
```bash
# S3 bucket connectivity
aws s3 ls s3://deepsynaps-mri-prod/ --recursive | head

# Disk space on workers
kubectl exec -it mri-gpu-worker-xyz -- df -h
```

### Step 5: Check Logs
```bash
# Recent errors
kubectl logs -l app=mri-gpu-worker --since=30m | grep ERROR

# Specific job failures
kubectl logs -l app=mri-gpu-worker | grep "task_failed"
```

## Resolution Steps

### If GPU workers are down:
1. Restart GPU worker pods:
   ```bash
   kubectl rollout restart deployment/mri-gpu-worker
   ```
2. Verify pods come up healthy
3. Check GPU availability: `nvidia-smi`

### If queue is backed up:
1. Scale up GPU workers:
   ```bash
   kubectl scale deployment/mri-gpu-worker --replicas=10
   ```
2. Monitor queue depth decrease
3. Scale back down after clearing

### If model loading fails:
1. Check model artifact availability in S3
2. Redeploy model configuration:
   ```bash
   kubectl apply -f k8s/mri-model-config.yaml
   ```

### If storage is full:
1. Check for orphaned temp files
2. Clear old processing temp directories
3. Alert platform team for capacity expansion

## Escalation
- If unresolved after 15 minutes: Escalate to ML Platform Team Lead
- If data loss suspected: Escalate immediately to Engineering Manager + Data Protection Officer
- If patient safety impact: Escalate to Chief Medical Officer

## Related
- [MRI Architecture Doc](https://wiki.deepsynaps.io/arch/mri-pipeline)
- [GPU Cluster Runbook](https://wiki.deepsynaps.io/runbooks/gpu-cluster)
- [Incident INC-2024-0031 (similar)](https://wiki.deepsynaps.io/incidents/INC-2024-0031)
```

### 13.2 Runbook: Database Primary Failure

```markdown
# Runbook: Database Primary Failure

**Alert:** DatabasePrimaryUnreachable  
**Severity:** CRITICAL  
**Service:** PostgreSQL  
**Last Updated:** 2025-01-10

## Impact
- All write operations fail
- New analyses cannot be queued
- Clinic data modifications blocked

## Diagnosis Steps

### Step 1: Check Database Connectivity
```bash
# From application pod
psql -h $DB_HOST -U $DB_USER -c "SELECT 1"

# Check endpoint health
aws rds describe-db-instances --db-instance-identifier deepsynaps-primary
```

### Step 2: Check Resource Utilization
```bash
# CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=deepsynaps-primary \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 --statistics Average

# Check for resource saturation
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=deepsynaps-primary \
  --start-time ... --end-time ... --period 60 --statistics Average
```

### Step 3: Check for Locks
```bash
# If can connect to read replica
psql -h $DB_REPLICA -c "
  SELECT pid, usename, query_start, state, query 
  FROM pg_stat_activity 
  WHERE state = 'active' AND now() - query_start > interval '1 minute';
"
```

## Resolution Steps

### If RDS automated failover occurred:
1. Check failover status:
   ```bash
   aws rds describe-db-instances --db-instance-identifier deepsynaps-primary | grep DBInstanceStatus
   ```
2. Verify application connections to new primary
3. Check replication to remaining replicas

### If manual intervention needed:
1. Promote read replica:
   ```bash
   aws rds promote-read-replica \
     --db-instance-identifier deepsynaps-replica-1
   ```
2. Update application DB endpoints (if not using DNS)
3. Verify writes succeed

### If resource exhaustion:
1. Scale up instance class:
   ```bash
   aws rds modify-db-instance \
     --db-instance-identifier deepsynaps-primary \
     --db-instance-class db.r6g.8xlarge \
     --apply-immediately
   ```
2. Monitor for recovery

## Escalation
- If unresolved after 10 minutes: Escalate to Database Team Lead
- If data loss suspected: Escalate to VP Engineering + Data Protection Officer
- If failover doesn't complete automatically: Page Infrastructure Team immediately

## Related
- [Database Architecture](https://wiki.deepsynaps.io/arch/database)
- [DR Procedures](https://wiki.deepsynaps.io/dr/database-failover)
- [AWS RDS Runbook](https://wiki.deepsynaps.io/runbooks/aws-rds)
```

### 13.3 Runbook: Model Drift Detection

```markdown
# Runbook: Model Drift Detected

**Alert:** ModelDriftDetected / ModelAccuracyCriticalDecline  
**Severity:** WARNING / CRITICAL  
**Service:** AI/ML Models  
**Last Updated:** 2025-01-18

## Impact
- Model predictions may become less reliable
- Clinical reports may contain less accurate findings
- Patient safety could be affected (if severe drift)

## Diagnosis Steps

### Step 1: Identify Drift Type
```bash
# Check drift dashboard
open https://grafana.deepsynaps.io/d/ml-drift?var-model={{ $labels.model_name }}

# Check which features are drifting
kubectl logs -l app=model-monitor --since=24h | grep "drift_score"
```

### Step 2: Analyze Affected Population
```sql
-- Check if drift affects specific clinic, scanner, or demographic
SELECT 
  clinic_id,
  scanner_model,
  COUNT(*) as scan_count,
  AVG(dice_score) as avg_dice
FROM mri_analysis_results
WHERE analyzed_at > NOW() - INTERVAL '7 days'
GROUP BY clinic_id, scanner_model
ORDER BY avg_dice ASC;
```

### Step 3: Check for Data Pipeline Changes
- Recent changes to preprocessing pipeline?
- New scanner models or software versions?
- Changes to DICOM transfer protocols?
- New clinic onboarding with different equipment?

### Step 4: Compare with Ground Truth
```bash
# If ground truth available
python scripts/validate_model.py \
  --model {{ $labels.model_name }} \
  --ground-truth-path s3://deepsynaps-ground-truth/ \
  --period last-7-days
```

## Resolution Steps

### If data pipeline issue:
1. Fix preprocessing pipeline
2. Reprocess affected scans
3. Verify accuracy returns to baseline

### If genuine distribution shift:
1. Collect new labeled data
2. Trigger model retraining pipeline
3. Validate new model on holdout set
4. Run A/B test before full deployment

### If temporary (e.g., conference season):
1. Monitor for recovery
2. Add alert annotation
3. No action needed if within expected variance

### If severe accuracy decline (> 5%):
1. Consider model rollback to previous version
2. Flag all recent analyses for manual review
3. Notify affected clinics
4. Emergency retraining initiated

## Escalation
- If WARNING: ML team standard review within 24 hours
- If CRITICAL: ML team lead within 2 hours
- If patient safety concern: Chief Medical Officer immediately

## Related
- [Model Retraining Pipeline](https://wiki.deepsynaps.io/ml/retraining)
- [A/B Testing Procedures](https://wiki.deepsynaps.io/ml/ab-testing)
- [Clinical Validation Protocol](https://wiki.deepsynaps.io/clinical/model-validation)
```

---

## 14. Appendix D: Metric Collection Reference

### 14.1 Metric Naming Convention

```
Format: <namespace>_<metric_name>_<unit>_<aggregation>

Namespaces:
  platform_     - Infrastructure and platform services
  api_          - API gateway and endpoints
  db_           - Database metrics
  queue_        - Job queue metrics
  mri_          - MRI pipeline metrics
  qeeg_         - qEEG pipeline metrics
  evidence_     - Evidence database metrics
  ml_           - ML model metrics
  gpu_          - GPU hardware metrics
  cost_         - Cost and billing metrics
  security_     - Security-related metrics
  compliance_   - Compliance audit metrics

Units:
  _total        - Counter (cumulative)
  _seconds      - Duration in seconds
  _bytes        - Size in bytes
  _count        - Discrete count
  _ratio        - Ratio (0-1)
  _percent      - Percentage (0-100)
  
Aggregations:
  (none)        - Instantaneous gauge
  _bucket       - Histogram bucket
  _sum          - Counter sum
  _count        - Counter count
```

### 14.2 Key Metrics Inventory

#### Infrastructure Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `platform_api_requests_total` | Counter | `method`, `endpoint`, `status_code`, `clinic_id` | Total API requests |
| `platform_api_request_duration_seconds` | Histogram | `method`, `endpoint` | Request latency distribution |
| `platform_api_request_size_bytes` | Histogram | `method`, `endpoint` | Request payload size |
| `platform_api_response_size_bytes` | Histogram | `method`, `endpoint` | Response size |
| `platform_active_connections` | Gauge | `service` | Current active connections |
| `platform_certificate_expiry_timestamp` | Gauge | `domain`, `issuer` | SSL cert expiry |

#### Database Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `db_postgres_connections_active` | Gauge | `database`, `state` | Active connections |
| `db_postgres_connections_total` | Gauge | `database` | Total connections |
| `db_postgres_query_duration_seconds` | Histogram | `database`, `query_type` | Query latency |
| `db_postgres_replication_lag_seconds` | Gauge | `replica` | Replication lag |
| `db_postgres_transactions_total` | Counter | `database`, `outcome` | Transaction count |
| `db_elasticsearch_search_query_time_seconds` | Histogram | `index` | Search latency |
| `db_elasticsearch_indexing_rate` | Gauge | `index` | Documents indexed/sec |
| `db_redis_memory_used_bytes` | Gauge | `instance` | Memory usage |
| `db_redis_commands_processed_total` | Counter | `instance`, `command` | Commands processed |

#### Queue Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `queue_celery_tasks_total` | Counter | `queue`, `state`, `task_name` | Tasks by state |
| `queue_celery_task_duration_seconds` | Histogram | `queue`, `task_name` | Task execution time |
| `queue_celery_workers_total` | Gauge | `queue` | Active workers |
| `queue_celery_queue_length` | Gauge | `queue` | Pending messages |
| `queue_celery_task_retries_total` | Counter | `queue`, `task_name` | Retry count |

#### MRI Pipeline Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `mri_analysis_total` | Counter | `type`, `status`, `clinic_id` | Analysis count |
| `mri_analysis_duration_seconds` | Histogram | `type`, `stage` | Stage duration |
| `mri_segmentation_dice_score` | Gauge | `model_version`, `sequence_type` | Segmentation quality |
| `mri_brain_age_error_years` | Gauge | `model_version` | Brain age MAE |
| `mri_processing_queue_depth` | Gauge | `stage` | Jobs per stage |
| `mri_storage_bytes` | Gauge | `clinic_id`, `scan_type` | Storage used |

#### qEEG Pipeline Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `qeeg_analysis_total` | Counter | `type`, `status`, `clinic_id` | Analysis count |
| `qeeg_analysis_duration_seconds` | Histogram | `type`, `stage` | Stage duration |
| `qeeg_artifact_f1_score` | Gauge | `model_version` | Artifact detection F1 |
| `qeeg_spectral_quality_score` | Gauge | `model_version` | Spectral analysis quality |
| `qeeg_processing_queue_depth` | Gauge | `stage` | Jobs per stage |
| `qeeg_usable_segments_ratio` | Gauge | `recording_id` | Post-artifact data quality |

#### AI/ML Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `ml_inference_requests_total` | Counter | `model_name`, `version`, `status` | Inference requests |
| `ml_inference_duration_seconds` | Histogram | `model_name`, `version`, `stage` | Inference latency |
| `ml_inference_queue_wait_seconds` | Histogram | `model_name` | Queue wait time |
| `ml_model_accuracy` | Gauge | `model_name`, `version`, `metric` | Model accuracy |
| `ml_model_drift_score` | Gauge | `model_name`, `drift_type` | Drift detection score |
| `ml_gpu_compute_seconds` | Counter | `model_name`, `gpu_id` | GPU time consumed |

#### GPU Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `gpu_utilization_percent` | Gauge | `gpu_id`, `node` | GPU compute utilization |
| `gpu_memory_used_bytes` | Gauge | `gpu_id`, `node` | GPU memory used |
| `gpu_memory_total_bytes` | Gauge | `gpu_id`, `node` | GPU memory total |
| `gpu_temperature_celsius` | Gauge | `gpu_id`, `node` | GPU temperature |
| `gpu_power_draw_watts` | Gauge | `gpu_id`, `node` | Power consumption |
| `gpu_xid_errors_total` | Counter | `gpu_id`, `node`, `error_code` | XID errors |
| `gpu_clock_frequency_mhz` | Gauge | `gpu_id`, `node`, `clock_type` | Clock frequency |

#### Evidence DB Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `evidence_papers_ingested_total` | Counter | `source` | Papers ingested |
| `evidence_papers_failed_total` | Counter | `source`, `error_type` | Failed ingestions |
| `evidence_ingestion_duration_seconds` | Histogram | `source`, `stage` | Ingestion stage time |
| `evidence_search_queries_total` | Counter | `query_type` | Search queries |
| `evidence_search_latency_seconds` | Histogram | `query_type` | Search latency |
| `evidence_citation_sync_lag_seconds` | Gauge | — | Citation sync lag |
| `evidence_index_document_count` | Gauge | `index` | Indexed documents |

#### Cost Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `cost_cloud_spend_dollars` | Gauge | `service`, `resource_type`, `environment` | Cloud spend |
| `cost_gpu_inference_dollars` | Counter | `model_name`, `clinic_id` | GPU cost per inference |
| `cost_storage_bytes` | Gauge | `clinic_id`, `data_type`, `tier` | Storage usage |
| `cost_api_calls_total` | Counter | `endpoint`, `clinic_id` | API call count |
| `cost_budget_utilization_ratio` | Gauge | `clinic_id`, `budget_period` | Budget utilization |

### 14.3 Log Schema

```json
{
  "timestamp": "2025-01-21T14:32:01.234Z",
  "level": "INFO|WARN|ERROR|FATAL",
  "service": "mri-pipeline|qeeg-pipeline|api-gateway|...",
  "component": "gpu-worker|segmentation-model|...",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "1234567890abcdef",
  "clinic_id": "C001234",
  "patient_id_hash": "sha256:abc123...",
  "study_id": "S987654",
  "message": "Human-readable log message",
  "context": {
    "model_version": "2.14.3",
    "gpu_id": "gpu-03",
    "queue_depth": 8,
    "processing_time_ms": 45000
  },
  "error": {
    "type": "GPUOutOfMemoryError",
    "message": "CUDA out of memory",
    "stacktrace": "..."
  }
}
```

---

## 15. References

### 15.1 Industry Standards & Frameworks

1. **Google SRE Book** — Beyer, B., Jones, C., Petoff, J., & Murphy, N. R. (2016). *Site Reliability Engineering: How Google Runs Production Systems*. O'Reilly Media.

2. **Google SRE Workbook** — Murphy, N. R., et al. (2018). *The Site Reliability Workbook: Practical Ways to Implement SRE*. O'Reilly Media.

3. **SLA/SLO Best Practices** — Google Cloud. (2024). *Creating and Using Service Level Objectives*. Available at: cloud.google.com/blog/products/devops-sre

4. **Prometheus Best Practices** — Prometheus Authors. (2024). *Alerting Rules and Management*. prometheus.io/docs/practices/alerting/

5. **AWS Well-Architected Framework** — AWS. (2024). *Operational Excellence Pillar*. aws.amazon.com/architecture/well-architected/

6. **NIST Cybersecurity Framework** — NIST. (2024). *Framework for Improving Critical Infrastructure Cybersecurity*. nist.gov/cyberframework

7. **HIPAA Security Rule** — HHS. (2024). *Security Standards for the Protection of Electronic Protected Health Information*. hhs.gov/hipaa/

8. **HL7 FHIR R4** — HL7 International. (2024). *Fast Healthcare Interoperability Resources Specification*. hl7.org/fhir/

### 15.2 Technical References

9. **Kubernetes Monitoring** — Kubernetes SIG Instrumentation. (2024). *Monitoring Best Practices for Kubernetes*. kubernetes.io/docs/concepts/cluster-administration/

10. **NVIDIA DCGM** — NVIDIA. (2024). *Data Center GPU Manager Documentation*. developer.nvidia.com/dcgm

11. **Celery Monitoring** — Celery Project. (2024). *Monitoring and Management Guide*. docs.celeryq.dev/

12. **Elasticsearch Monitoring** — Elastic. (2024). *Monitoring Production Deployments*. elastic.co/guide/

13. **OpenTelemetry** — CNCF. (2024). *OpenTelemetry Specification*. opentelemetry.io/docs/

14. **Chaos Engineering** — Gremlin. (2024). *Chaos Engineering Best Practices*. gremlin.com/community/

15. **PagerDuty Incident Response** — PagerDuty. (2024). *Incident Response Documentation*. pagerduty.com/resources/

### 15.3 Healthcare AI & Compliance

16. **FDA AI/ML-Based SaMD Action Plan** — FDA. (2024). *Artificial Intelligence/Machine Learning-Based Software as a Medical Device Action Plan*. fda.gov/medical-devices/

17. **ISO 13485:2016** — ISO. (2016). *Medical devices — Quality management systems*.

18. **ISO 14971:2019** — ISO. (2019). *Medical devices — Application of risk management*.

19. **DICOM PS3.15** — NEMA. (2024). *Security and System Management Profiles*. dicom.nema.org/

20. **GDPR Article 32** — EU. (2016). *Security of Processing*. gdpr.eu/

### 15.4 Internal Documentation

21. DeepSynaps Architecture Decision Records (ADRs) — Internal Wiki
22. DeepSynaps Security Policies — Internal Wiki
23. DeepSynaps Clinical Validation Protocols — Internal Wiki
24. DeepSynaps Deployment Playbooks — Internal Repository
25. DeepSynaps Incident Response Plan — Internal Wiki

---

*Document compiled by the DeepSynaps Platform Engineering Team.*  
*For questions, corrections, or additions, contact platform-ops@deepsynaps.io*  
*© 2025 DeepSynaps Inc. — Confidential and Proprietary*

---
*End of Document*
