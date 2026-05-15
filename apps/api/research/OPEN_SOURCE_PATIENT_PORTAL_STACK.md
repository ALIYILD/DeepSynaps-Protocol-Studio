# Open-Source Patient Portal Stack - Research Report
## Top 10 Open-Source Tools for Building Patient Portals | 2025-2026

---

## Executive Summary

This report evaluates the top 10 open-source tools for building patient-facing healthcare portals in 2025-2026. Each tool is assessed by GitHub popularity, license, FHIR support, community health, and integration suitability for a modern patient dashboard.

---

## 1. OpenEMR

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/openemr/openemr |
| **License** | GNU GPL v3 |
| **Stars** | 3,500+ |
| **Language** | PHP, JavaScript, Node.js |
| **FHIR Support** | FHIR R4 (via ONC-certified module) |
| **Maturity** | 20+ years, ONC Certified |

**Key Features:**
- Fully integrated EHR + practice management + patient portal
- Patient portal module with secure messaging, appointment scheduling, prescription refills
- ONC Health IT Certified (2015 Edition Cures Update)
- Lab integration, e-prescribing, billing (HIPAA X12 5010)
- Clinical decision rules engine
- Multi-language support (30+ languages)
- Self-hosted, on-premises or cloud deployment
- Active community with 200+ contributors

**Integration Recommendation:**
Best for **full-featured patient portal with EHR backend**. If you need a complete solution rather than building from scratch, OpenEMR's patient portal module can be customized. Use its FHIR R4 API to connect with modern frontend frameworks. Note: PHP codebase may require additional maintenance effort for modern frontend integrations.

---

## 2. Medplum + Foo Medical

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/medplum/medplum |
| **Foo Medical** | https://github.com/medplum/foomedical |
| **License** | Apache 2.0 |
| **Stars** | 1,500+ (Medplum) |
| **Language** | TypeScript, React |
| **FHIR Support** | Native FHIR R4 |
| **Maturity** | Production-ready, actively maintained |

**Key Features:**
- Headless FHIR-native healthcare platform
- Foo Medical: ready-to-use open-source patient portal sample app
- Patient registration, authentication, health records
- Lab results, medications, vaccines, vitals
- Patient-provider messaging, care plans, scheduling
- All data represented natively in FHIR
- Built with React + TypeScript
- Bot/automation framework for workflows
- Subscriptions for real-time updates
- Hosted or self-hosted options

**Integration Recommendation:**
Best for **modern React-based patient portal**. Fork Foo Medical as a starting template and customize with Medplum's FHIR APIs. This is the most "batteries-included" modern stack. Strongly recommended for teams building a patient dashboard with React/TypeScript. Medplum handles the FHIR backend, auth, and data layer.

---

## 3. HAPI FHIR

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/hapifhir/hapi-fhir |
| **Starter** | https://github.com/hapifhir/hapi-fhir-jpaserver-starter |
| **License** | Apache 2.0 |
| **Stars** | 2,100+ |
| **Language** | Java (Spring Boot) |
| **FHIR Support** | R4, R4B, R5, STU3, DSTU2 |
| **Maturity** | Industry standard, HL7 reference implementation |

**Key Features:**
- Java-based FHIR server with full CRUD operations
- JPA server with database persistence (PostgreSQL, H2)
- Full-text search, subscription support
- Validation engine (FHIR Validator)
- Docker deployment support
- RESTful API with OpenAPI/Swagger documentation
- Interceptors and custom operations support
- Multi-version FHIR support
- Widely adopted reference implementation

**Integration Recommendation:**
Best for **FHIR backend server**. Use HAPI FHIR as the data layer/storage engine for your patient portal. Build your frontend (React/Vue) to communicate with HAPI FHIR's REST API. Deploy via Docker for easy setup. Combine with a separate auth service for production use.

---

## 4. OpenMRS

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/openmrs/openmrs-core |
| **License** | MPL 2.0 (with special exception) |
| **Stars** | 1,100+ |
| **Language** | Java, React |
| **FHIR Support** | FHIR R4 (via FHIR2 module) |
| **Maturity** | 20+ years, WHO partner |

**Key Features:**
- Modular architecture with hundreds of add-ons
- Concept dictionary for standardized terminology
- REST and FHIR APIs for integration
- Reference Application with patient-facing features
- Strong internationalization support
- Active global community (used in 60+ countries)
- Built-in reporting and data export
- Form builder for custom data collection
- Supports complex clinical workflows

**Integration Recommendation:**
Best for **global health or resource-limited settings**. OpenMRS's modular architecture allows incremental feature addition. Use its REST/FHIR APIs as a backend for a custom patient dashboard. Better suited for clinical environments than direct patient portals, but Reference App provides a foundation.

---

## 5. Ottehr

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/ottehr/ottehr |
| **License** | Not specified (open source) |
| **Stars** | Emerging (200+) |
| **Language** | TypeScript, React |
| **FHIR Support** | FHIR-native |
| **Maturity** | Production-ready, actively developed |

**Key Features:**
- First FHIR-native EHR
- Patient registration, paperwork, scheduling
- ePrescriptions (eRx) with automatic rerouting
- 1-way and 2-way SMS/chat patient engagement
- Telehealth support out-of-the-box
- Revenue cycle management (insurance, billing, claims)
- AI transcription and encounter summarization
- Customizable frontend with modular architecture
- White-label ready
- Scales to millions of patient visits

**Integration Recommendation:**
Best for **building a full-service telehealth + patient portal**. Ottehr's modular frontend and headless architecture make it ideal for customization. Its patient engagement features (SMS, chat, telehealth) are well-suited for modern patient dashboards. Fork and customize the patient-facing components.

---

## 6. Fasten Health (On-Prem PHR)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/fastenhealth/fasten-onprem |
| **License** | GPL v3 |
| **Stars** | 2,000+ |
| **Language** | Go, Angular, TypeScript |
| **FHIR Support** | FHIR-native (imports FHIR Bundles) |
| **Maturity** | Active development, community-driven |

**Key Features:**
- Self-hosted personal/family health record
- Aggregates data from multiple healthcare providers
- FHIR protocol support for data import
- Docker deployment (simple `docker-compose up`)
- Condition-specific dashboards
- Vaccination tracking with CDC/WHO guidelines
- Designed for families (multi-user support planned)
- Local-only data storage (privacy-first)
- Web-based interface accessible from any device
- Open-source and auditable

**Integration Recommendation:**
Best for **patient health record aggregation**. Fasten is designed as a PHR viewer rather than a clinical portal, but its FHIR-native architecture and dashboard patterns can be adapted. Use it as a reference for how to aggregate and display multi-source FHIR data. Its Docker deployment model simplifies infrastructure setup.

---

## 7. Mere Medical

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/cfu288/mere-medical |
| **License** | Open source (check repo for specific license) |
| **Stars** | 300+ |
| **Language** | TypeScript, Nx monorepo (React + Node) |
| **FHIR Support** | FHIR R4 (connects to Epic, Cerner, Veradigm) |
| **Maturity** | Active development |

**Key Features:**
- Offline-first, self-hosted web app
- Aggregates medical records from patient portals
- Direct connections to Epic (MyChart), Cerner, Veradigm
- Docker deployment with SSL certificate support
- Nx monorepo architecture (API + Web app)
- Environment-based configuration
- Patient-controlled data import
- Sync capabilities with major EHR patient portals

**Integration Recommendation:**
Best for **EHR patient portal aggregator reference**. Mere Medical's architecture shows how to build a modern offline-first patient data aggregator. Its Nx monorepo structure and TypeScript/React stack make it a good reference for building a patient dashboard that pulls data from multiple EHR sources.

---

## 8. Open Wearables

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/the-momentum/open-wearables |
| **License** | MIT |
| **Stars** | 1,000+ |
| **Language** | Python (FastAPI), React, TypeScript |
| **FHIR Support** | Custom API (normalized data) |
| **Maturity** | Active development, production-ready |

**Key Features:**
- Unified API for wearable device data
- Supports: Apple Health, Samsung Health, Garmin, Polar, Suunto, Whoop, Oura, Fitbit
- Normalized health data schemas (activity, sleep, biometrics, recovery)
- OAuth flow management for all providers
- Developer portal with user management
- Health scoring algorithms (open source, transparent)
- AI health assistant (natural language queries)
- Embeddable widgets for app integration
- MCP Server for Claude/ChatGPT integration
- Self-hosted, Docker deployment
- Mobile SDKs (iOS, Android, Flutter, React Native)

**Integration Recommendation:**
Best for **wearable device data integration in patient dashboards**. If your patient portal needs to display data from Apple Watch, Fitbit, Garmin, or other wearables, Open Wearables eliminates months of per-device integration work. Deploy alongside your patient portal and use its REST API to pull normalized health data.

---

## 9. OpenEHR / EHRbase

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/ehrbase/ehrbase |
| **License** | Apache 2.0 |
| **Stars** | 700+ |
| **Language** | Java, Kotlin |
| **FHIR Support** | openEHR + FHIR bridge available |
| **Maturity** | Mature specification, production deployments |

**Key Features:**
- Vendor-neutral health data storage based on openEHR specifications
- Archetype-based data modeling (clinical content models)
- Clinical Data Repository (CDR) for structured health data
- Template management for customizable clinical forms
- REST API for data access and storage
- AQL query language for clinical data queries
- Multi-tenancy support
- Identity management via Keycloak integration
- 2FA support, ATNA audit logging
- Form builder add-on
- Patient viewer UI add-on

**Integration Recommendation:**
Best for **long-term health data storage with semantic richness**. openEHR's archetype system enables more expressive clinical data modeling than FHIR alone. Use EHRbase as the backend clinical data repository and build your patient dashboard to query it via AQL and REST APIs. Ideal for research and complex clinical scenarios.

---

## 10. Hospital Management Dashboard (React/MUI)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/JassaRich/HospitalManagementDashboardReact |
| **License** | Open source (educational) |
| **Stars** | 200+ |
| **Language** | React, Material-UI (MUI) |
| **FHIR Support** | None (standalone dashboard) |
| **Maturity** | Educational/reference implementation |

**Key Features:**
- Beautiful dashboard with charts and widgets
- Patient, Doctor, and Appointment overview pages
- Hospital stats and performance tracking
- Light/Dark mode support via MUI theme
- Fully responsive layout
- Easy to customize and extend
- Clean, modern UI design
- React + MUI tech stack

**Integration Recommendation:**
Best for **UI/UX reference and rapid prototyping**. This dashboard template demonstrates modern healthcare UI patterns with React and MUI. Use it as a visual reference for building your patient dashboard components (appointment cards, stats widgets, data tables). It is NOT production-ready for PHI handling but serves as an excellent starting point for UI development. Combine with a FHIR backend (Medplum/HAPI) for a complete solution.

---

## Comparison Matrix

| Tool | License | Stars | FHIR | Frontend | Best For |
|------|---------|-------|------|----------|----------|
| OpenEMR | GPL | 3,500+ | R4 | PHP/JS | Full EHR + Portal |
| Medplum | Apache 2.0 | 1,500+ | Native | React/TS | Modern React portal |
| HAPI FHIR | Apache 2.0 | 2,100+ | Multi | N/A (backend) | FHIR backend server |
| OpenMRS | MPL | 1,100+ | R4 | Java/React | Global health |
| Ottehr | Open | 200+ | Native | React/TS | Telehealth + Portal |
| Fasten | GPL | 2,000+ | Native | Angular/TS | Self-hosted PHR |
| Mere Medical | OSS | 300+ | R4 | React/TS | EHR aggregator |
| Open Wearables | MIT | 1,000+ | Custom | React/TS | Wearable data |
| EHRbase | Apache 2.0 | 700+ | Bridge | Java/Kotlin | Clinical data store |
| Hosp Dashboard | OSS | 200+ | None | React/MUI | UI reference |

---

## Recommended Stack Architecture

For building a modern patient dashboard, we recommend this layered approach:

```
+--------------------------+
|  React/TypeScript UI     |  <-- Foo Medical / Custom React
|  (Patient Dashboard)     |
+--------------------------+
|         |                |
|  FHIR REST API           |
|         |                |
+--------------------------+
|  Medplum / HAPI FHIR     |  <-- FHIR Server
|  (Data + Auth Layer)     |
+--------------------------+
|         |                |
|  Open Wearables API      |  <-- Wearable Data (optional)
|         |                |
+--------------------------+
|  EHRbase / PostgreSQL    |  <-- Data Storage
+--------------------------+
```

**Recommended Primary Stack:**
- **Frontend:** React + TypeScript + Foo Medical (fork)
- **Backend:** Medplum (FHIR-native, headless)
- **Wearables:** Open Wearables (if needed)
- **Auth:** Medplum built-in + Keycloak for advanced RBAC
- **Deployment:** Docker Compose or Kubernetes

---

## Sources
- GitHub repositories (linked above)
- Medplum documentation (medplum.com)
- HAPI FHIR documentation (hapifhir.io)
- OpenEMR wiki (open-emr.org)
- OpenMRS wiki (openmrs.org)
- Ottehr product site (ottehr.com)
- Fasten Health GitHub documentation
- Open Wearables documentation (openwearables.io)
- EHRbase documentation (ehrbase.org)
- openEHR specifications (openehr.org)

---

*Report generated: 2025 | Research scope: Open-source patient portal technology stack*
