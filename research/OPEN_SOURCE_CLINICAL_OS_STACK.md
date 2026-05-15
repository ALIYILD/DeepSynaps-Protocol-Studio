# Open Source Clinical Operating System Stack: A Comprehensive Research Report

> **Document Version:** 1.0
> **Last Updated:** 2026-01-18
> **Author:** DeepSynaps Protocol Studio Research Team
> **Classification:** Architecture Research / Frontend Stack Analysis
> **Target Audience:** Healthcare UX Architects, Clinical SaaS Engineers, Digital Health CTOs

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Section 1: EHR/Clinical Platforms](#section-1-ehrclinical-platforms)
  - [1.1 OpenEMR (GPL-3.0)](#11-openemr-gpl-30)
  - [1.2 OpenMRS (MPL-2.0)](#12-openmrs-mpl-20)
  - [1.3 GNU Health (GPL-3.0)](#13-gnu-health-gpl-30)
  - [1.4 HospitalRun (MIT) [ARCHIVED]](#14-hospitalrun-mit-archived)
  - [1.5 LibreHealth (MPL-2.0)](#15-librehealth-mpl-20)
- [Section 2: Dashboard Frameworks](#section-2-dashboard-frameworks)
  - [2.1 React Admin (MIT)](#21-react-admin-mit)
  - [2.2 Refine (MIT)](#22-refine-mit)
  - [2.3 Tabler (MIT)](#23-tabler-mit)
  - [2.4 AdminJS (MIT)](#24-adminjs-mit)
  - [2.5 Appsmith (Apache-2.0)](#25-appsmith-apache-20)
- [Section 3: Navigation Components](#section-3-navigation-components)
  - [3.1 react-pro-sidebar (MIT)](#31-react-pro-sidebar-mit)
  - [3.2 react-router-dom (MIT)](#32-react-router-dom-mit)
  - [3.3 @reach/router (MIT)](#33-reachrouter-mit)
  - [3.4 wouter (ISC)](#34-wouter-isc)
- [Section 4: Healthcare UI Components](#section-4-healthcare-ui-components)
  - [4.1 FHIR React Components](#41-fhir-react-components)
  - [4.2 Medical Icon Sets](#42-medical-icon-sets)
  - [4.3 Chart.js (MIT)](#43-chartjs-mit)
  - [4.4 D3.js (BSD/ISC)](#44-d3js-bsdisc)
- [Section 5: State Management](#section-5-state-management)
  - [5.1 Zustand (MIT)](#51-zustand-mit)
  - [5.2 Jotai (MIT)](#52-jotai-mit)
  - [5.3 Redux Toolkit (MIT)](#53-redux-toolkit-mit)
- [Section 6: Accessibility Libraries](#section-6-accessibility-libraries)
  - [6.1 @reach/menu-button (MIT)](#61-reachmenu-button-mit)
  - [6.2 @reach/disclosure (MIT)](#62-reachdisclosure-mit)
  - [6.3 @radix-ui/react-collapsible (MIT)](#63-radix-uireact-collapsible-mit)
  - [6.4 react-aria (Apache-2.0)](#64-react-aria-apache-20)
- [Section 7: Testing Frameworks](#section-7-testing-frameworks)
  - [7.1 Vitest (MIT)](#71-vitest-mit)
  - [7.2 Playwright (Apache-2.0)](#72-playwright-apache-20)
  - [7.3 Testing Library (MIT)](#73-testing-library-mit)
- [Section 8: Recommended Clinical OS Architecture](#section-8-recommended-clinical-os-architecture)
  - [8.1 Reference Architecture Diagram](#81-reference-architecture-diagram)
  - [8.2 Integration Matrix](#82-integration-matrix)
  - [8.3 License Compatibility Analysis](#83-license-compatibility-analysis)
  - [8.4 Healthcare Safety UX Considerations](#84-healthcare-safety-ux-considerations)
- [Appendix A: Quick Comparison Tables](#appendix-a-quick-comparison-tables)
- [Appendix B: GitHub Star Counts & Activity](#appendix-b-github-star-counts--activity)
- [Appendix C: Clinical Suitability Scorecard](#appendix-c-clinical-suitability-scorecard)
- [Appendix D: Integration Path Recommendations](#appendix-d-integration-path-recommendations)
- [References](#references)

---

## Executive Summary

This report presents a comprehensive analysis of open-source tools suitable for building a **Clinical Operating System (Clinical OS)** -- a modern, web-based healthcare platform that combines electronic health records, clinical dashboards, and patient management into a unified, accessible, and compliant user experience.

### Why Open Source for Clinical Systems?

Healthcare software demands the highest standards of **safety**, **accessibility**, **interoperability**, and **compliance**. Open-source tools provide:

1. **Auditability** -- Source code can be reviewed for security and compliance (HIPAA, SOC 2, HITRUST)
2. **Interoperability** -- FHIR-native tools enable seamless data exchange between systems
3. **Vendor Independence** -- No lock-in to proprietary platforms with unpredictable pricing
4. **Community Validation** -- Tools with large communities have been battle-tested across diverse clinical environments
5. **Customization** -- Healthcare workflows vary significantly; open source enables domain-specific adaptations

### Research Methodology

Each tool in this report was evaluated against the following criteria:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **License Compatibility** | High | Open-source license permissiveness for commercial healthcare use |
| **GitHub Stars & Activity** | Medium | Community size, contributor count, commit frequency |
| **Clinical Suitability** | High | FHIR support, medical UX patterns, accessibility compliance |
| **Integration Path** | High | Ease of integration with other clinical tools and existing systems |
| **Enterprise Readiness** | Medium | TypeScript support, testing infrastructure, documentation quality |
| **Accessibility (a11y)** | Critical | WCAG 2.1 AA/AAA compliance, screen reader support, keyboard navigation |
| **Safety UX Patterns** | Critical | Error prevention, confirmation dialogs, audit logging visibility |

### Key Findings at a Glance

- **Best EHR Foundation:** OpenEMR (GPL-3.0) with 30+ FHIR resources, ONC-certified, active community
- **Best Dashboard Framework:** Refine (MIT) with 34k+ stars, headless architecture, 15+ backend connectors
- **Best Navigation:** react-router-dom + @radix-ui/react-collapsible for accessible sidebar patterns
- **Best Healthcare UI:** bonFHIR + Health Icons for FHIR-native components with clinical iconography
- **Best State Management:** Zustand (MIT) for its simplicity, TypeScript support, and minimal boilerplate
- **Best Accessibility:** react-aria (Apache-2.0) from Adobe -- the gold standard for accessible UI primitives
- **Best Testing Stack:** Vitest + Playwright + Testing Library for fast, reliable, a11y-aware testing

---

## Section 1: EHR/Clinical Platforms

> EHR platforms form the data foundation of any Clinical OS. These open-source systems provide patient records, scheduling, billing, clinical decision support, and FHIR APIs that modern frontend applications consume.

---

### 1.1 OpenEMR (GPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/openemr/openemr](https://github.com/openemr/openemr) |
| **License** | GNU General Public License v3.0 |
| **GitHub Stars** | 8,500+ |
| **Language** | PHP, JavaScript, Node.js |
| **First Release** | 2002 (originally Open Source Medical Records System) |
| **Latest Activity** | Active -- weekly commits, major sponsors including ONC |
| **Community** | 100+ contributors, extensive documentation, professional support available |

#### Overview

OpenEMR is the most widely deployed open-source electronic health records and medical practice management application globally. It features fully integrated electronic health records, practice management, scheduling, electronic billing, internationalization, and a robust API layer. The project runs on Windows, Linux, macOS, and many other platforms, making it one of the most portable clinical systems available.

#### Key Features

- **Electronic Health Records:** Comprehensive patient charting with customizable forms
- **Practice Management:** Scheduling, appointment management, patient flow tracking
- **Electronic Billing:** Insurance claims, patient billing, payment processing
- **Patient Portal:** Self-service patient access to appointments, records, messaging
- **Clinical Decision Support:** Alerts, reminders, and evidence-based guidelines
- **Multi-Site Support:** Federated deployment across multiple clinic locations
- **Internationalization:** Support for multiple languages and regional configurations
- **ONC Certification:** Certified for Meaningful Use criteria

#### FHIR API Coverage (30+ Resources)

OpenEMR provides extensive FHIR R4 API support, making it an ideal backend for modern Clinical OS frontends:

| FHIR Resource | Status | Clinical OS Relevance |
|---------------|--------|----------------------|
| Patient | CRUD + Search | Core patient identity management |
| Practitioner | CRUD + Search | Provider directory and roster |
| Organization | CRUD + Search | Hospital, clinic, department hierarchy |
| Location | CRUD + Search | Room, bed, facility tracking |
| Observation | CRUD + Search | Vital signs, lab results, clinical measurements |
| Condition | CRUD + Search | Problem lists, diagnoses, comorbidities |
| Procedure | CRUD + Search | Performed interventions and treatments |
| AllergyIntolerance | CRUD + Search | Critical allergy and adverse reaction data |
| MedicationRequest | CRUD + Search | Prescription and medication orders |
| MedicationDispense | CRUD + Search | Pharmacy dispensing records |
| Immunization | CRUD + Search | Vaccination history and schedules |
| Encounter | CRUD + Search | Visit, admission, consultation tracking |
| Appointment | CRUD + Search | Scheduling integration |
| CarePlan | CRUD + Search | Treatment plans and care coordination |
| CareTeam | CRUD + Search | Multi-disciplinary care team management |
| DiagnosticReport | CRUD + Search | Lab reports, imaging results, pathology |
| ServiceRequest | CRUD + Search | Order management for labs, imaging, consults |
| Specimen | CRUD + Search | Lab specimen tracking |
| DocumentReference | CRUD + Search | Clinical documents, attachments, CCDA |
| Binary | CRUD | File storage and retrieval |
| Provenance | CRUD | Data lineage and audit tracking |
| Goal | CRUD + Search | Patient goals and care objectives |
| Device | CRUD + Search | Implanted and external device tracking |
| Coverage | CRUD + Search | Insurance and payer information |
| RelatedPerson | CRUD + Search | Emergency contacts, family members |

#### API Operations

- **Standard CRUD:** Read, Search, Create, Update, Delete per resource
- **Bulk Export:** `$export` operation for population-level data extraction
- **CCD Generation:** `$docref` for clinical document generation
- **Token Introspection:** OAuth 2.0 / SMART on FHIR authentication
- **Capability Statement:** Auto-generated FHIR capability documentation

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Maturity** | 9/10 | 30+ FHIR R4 resources, actively expanding |
| **Patient Safety** | 8/10 | Clinical decision support, allergy alerts |
| **Accessibility** | 7/10 | Moderate WCAG compliance in patient portal |
| **Audit & Compliance** | 9/10 | Comprehensive audit logging, HIPAA-ready |
| **Scalability** | 7/10 | Suitable for small-to-mid practices; enterprise clustering requires work |
| **Interoperability** | 9/10 | FHIR, HL7 v2, CCDA, Direct Messaging support |

#### Integration Path

```typescript
// Example: Fetching patient data from OpenEMR FHIR API
const fetchPatient = async (patientId: string, accessToken: string) => {
  const response = await fetch(
    `https://openemr-instance.example.com/apis/default/fhir/Patient/${patientId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/fhir+json',
      },
    }
  );
  return response.json(); // Returns FHIR R4 Patient resource
};

// Example: Searching patients by name
const searchPatients = async (query: string, accessToken: string) => {
  const response = await fetch(
    `https://openemr-instance.example.com/apis/default/fhir/Patient?name=${encodeURIComponent(query)}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );
  return response.json(); // Returns FHIR Bundle of Patient resources
};
```

#### Architecture Integration

OpenEMR serves as the **data layer** and **FHIR server** in a Clinical OS architecture. The modern React-based frontend communicates via RESTful FHIR APIs, with OpenEMR handling:

1. **Authentication & Authorization** -- OAuth 2.0 / OpenID Connect / SMART on FHIR
2. **Data Persistence** -- PostgreSQL/MySQL backend with FHIR resource mapping
3. **Business Logic** -- Clinical workflows, billing rules, scheduling algorithms
4. **Interoperability** -- FHIR APIs, HL7 interfaces, document exchange

> **Recommendation:** OpenEMR is the recommended EHR backend for Clinical OS builds targeting small-to-medium healthcare practices. For large health systems, consider it as a departmental EHR or integrate via FHIR to an enterprise EHR (Epic, Cerner) using their FHIR APIs.

---

### 1.2 OpenMRS (MPL-2.0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/openmrs/openmrs-core](https://github.com/openmrs/openmrs-core) |
| **License** | Mozilla Public License 2.0 |
| **GitHub Stars** | 1,200+ (core); 4,000+ across ecosystem |
| **Language** | Java, React (reference application) |
| **First Release** | 2004 |
| **Latest Activity** | Active -- recognized as Digital Public Good |
| **Community** | Global contributor network, deployed in 5,000+ facilities |

#### Overview

OpenMRS (Open Medical Record System) is a collaborative open-source project to develop software supporting healthcare delivery, with a particular focus on resource-constrained environments. Founded on principles of openness and sharing, OpenMRS is deployed at national scale in countries including Bangladesh, Botswana, Haiti, Kenya, Malawi, Mozambique, Nigeria, Rwanda, and Uganda. It was recognized as a **Digital Public Good** by the Digital Public Goods Alliance in 2024.

#### Key Features

- **Concept Dictionary:** Extensible medical terminology system supporting any coding standard
- **Patient Management:** Registration, visits, encounters, and longitudinal care tracking
- **Clinical Data:** Observations, diagnoses, procedures, and clinical notes
- **Reporting Framework:** Built-in and custom report generation for population health
- **Module System:** Extensible architecture with 100+ community modules
- **Reference Application:** Modern React-based UI for clinical workflows
- **REST & FHIR APIs:** Full programmatic access to all clinical data
- **Offline Capability:** Form entry with synchronization for disconnected environments

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Maturity** | 7/10 | FHIR module available; primarily REST-based historically |
| **Patient Safety** | 8/10 | Drug-drug interaction checking, allergy warnings |
| **Accessibility** | 6/10 | Varies by module; improving in Reference Application |
| **Audit & Compliance** | 8/10 | Comprehensive auditing, role-based access control |
| **Scalability** | 9/10 | Proven at national scale (Kenya, Rwanda nationwide deployments) |
| **Interoperability** | 8/10 | FHIR, HL7 v2, CIEL/LOINC/ICD terminology support |

#### Unique Strengths

- **Resource-Constrained Deployment:** Designed for low-resource settings with limited connectivity
- **National-Scale Proven:** Deployed at the national level in multiple countries
- **Extensible Concept Dictionary:** Adaptable to any medical terminology or coding system
- **Global Health Focus:** Strong community in global health, infectious disease, and public health

#### Integration Path

```typescript
// Example: OpenMRS REST API integration
const fetchPatientObservations = async (
  patientUuid: string,
  conceptUuid: string,
  sessionToken: string
) => {
  const response = await fetch(
    `/openmrs/ws/rest/v1/obs?patient=${patientUuid}&concept=${conceptUuid}&v=full`,
    {
      headers: {
        'Authorization': `Basic ${sessionToken}`,
        'Accept': 'application/json',
      },
    }
  );
  return response.json();
};
```

> **Recommendation:** OpenMRS is the recommended platform for **global health initiatives**, **public health programs**, and **resource-constrained environments**. Its modular architecture and concept dictionary make it ideal for implementations requiring extensive customization of clinical workflows and terminology.

---

### 1.3 GNU Health (GPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [codeberg.org/gnuhealth](https://codeberg.org/gnuhealth) (primary); GitHub mirrors |
| **License** | GNU General Public License v3.0 or later |
| **GitHub Stars** | 500+ (primary on Codeberg) |
| **Language** | Python (Tryton framework), JavaScript |
| **First Release** | 2008 (originally Medical) |
| **Latest Activity** | Active -- official GNU Project package |
| **Community** | GNU Solidario organization, FSF-endorsed |

#### Overview

GNU Health is a free Health and Hospital Information System (HIS) and Electronic Medical Record (EMR) system developed by GNU Solidario, a non-profit, non-governmental organization. In 2011, the Free Software Foundation adopted GNU Health as an official package of the GNU project. The GNU Health Federation enables secure sharing of anonymized health data for public health research and disease surveillance.

#### Key Features

- **Hospital Information System:** Full inpatient/outpatient management
- **Electronic Medical Records:** Longitudinal patient records with problem lists
- **Laboratory Management:** Lab order management, results entry, reporting
- **Pharmacy Management:** Inventory, dispensing, drug interaction checking
- **Genetics:** Hereditary disease tracking, family history analysis
- **Epidemiology:** Disease surveillance, outbreak detection, reporting
- **Health Insurance:** Claims processing, coverage verification
- **Nursing:** Care plans, medication administration records (MAR)
- **Surgery:** Operating room scheduling, procedure documentation
- **Reporting:** DHIS2 integration, public health reporting
- **GNU Health Federation:** Distributed, privacy-preserving health data network

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Maturity** | 5/10 | Limited FHIR support; primarily uses native data model |
| **Patient Safety** | 8/10 | Drug interactions, allergy alerts, clinical protocols |
| **Accessibility** | 6/10 | Desktop-focused; web client improving |
| **Audit & Compliance** | 8/10 | Full audit trails, GDPR-ready design |
| **Scalability** | 7/10 | Suitable for small-to-large hospitals |
| **Interoperability** | 6/10 | HL7, DHIS2 integration; FHIR emerging |

#### Unique Strengths

- **Public Health Focus:** Built-in epidemiology and disease surveillance capabilities
- **Genetics Module:** Unique support for hereditary disease tracking
- **GNU Project Backing:** Ideologically committed to software freedom in healthcare
- **Federation Architecture:** Privacy-preserving distributed data sharing for research
- **Privacy by Design:** Emphasizes patient data sovereignty and privacy

#### Integration Path

GNU Health uses the Tryton framework with a desktop client (GTK). Integration with a modern Clinical OS frontend requires:

1. **Tryton JSON-RPC API:** Direct API access to all GNU Health modules
2. **FHIR Gateway:** Community FHIR adapters are emerging
3. **Database Replication:** Read replicas for analytics and reporting
4. **Message Queues:** Event-driven integration via AMQP/RabbitMQ

```typescript
// Example: Tryton JSON-RPC integration
const gnuHealthClient = {
  async authenticate(username: string, password: string) {
    const response = await fetch('/tryton/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'common.db.login',
        params: [username, { password }],
      }),
    });
    return response.json();
  },

  async searchPatients(searchTerm: string, sessionId: string) {
    const response = await fetch('/tryton/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'model.gnuhealth.patient.search',
        params: [sessionId, [['name', 'ilike', `%${searchTerm}%`]], 0, 20, null, {}],
      }),
    });
    return response.json();
  },
};
```

> **Recommendation:** GNU Health is ideal for **public health institutions**, **hospitals in developing regions**, and **organizations prioritizing software freedom and patient privacy**. Its unique genetics and epidemiology modules differentiate it for specialized use cases.

---

### 1.4 HospitalRun (MIT) [ARCHIVED]

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/HospitalRun](https://github.com/HospitalRun) (archived) |
| **License** | MIT License |
| **GitHub Stars** | 6,500+ (at peak) |
| **Language** | JavaScript, TypeScript (React, CouchDB/PouchDB) |
| **First Release** | 2013 (CURE International) |
| **Latest Activity** | **ARCHIVED** -- All repositories archived October 2023 |
| **Community** | OpenJS Foundation member; 100+ contributors historically |

#### Overview

HospitalRun was an offline-first electronic medical record system designed specifically for resource-constrained environments, particularly those with unreliable internet connectivity. Originally developed by CURE International for their network of pediatric surgical hospitals, it became an OpenJS Foundation project and gained significant community traction.

#### Key Features (Historical)

- **Offline-First Architecture:** PouchDB + CouchDB for local data with background sync
- **Patient Management:** Registration, appointments, visits, and clinical encounters
- **Custom Forms:** Configurable clinical forms for patients, visits, labs, incidents
- **Inventory Management:** Medication and supply tracking with consumption awareness
- **Operative Planning:** Surgical scheduling and operative report generation
- **Shortcode Support:** Clinical text shorthand for rapid documentation
- **Electron Desktop App:** Cross-platform desktop application
- **Multi-Browser Support:** Works on Chrome, Firefox, Safari, Edge

#### Why It Was Archived

The HospitalRun project was officially archived in October 2023. All repositories were marked as read-only. The project maintainers cited reaching its "final stage" and no longer being able to provide updates. The archive preserves the codebase for reference and potential community forks.

#### Clinical Suitability (Historical)

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Maturity** | 3/10 | Pre-FHIR era; custom data model |
| **Patient Safety** | 6/10 | Basic alerts and clinical checks |
| **Accessibility** | 5/10 | Limited accessibility compliance |
| **Audit & Compliance** | 5/10 | Basic audit logging |
| **Scalability** | 5/10 | Single-instance deployment model |
| **Interoperability** | 4/10 | Limited external system integration |

#### Legacy Value

Despite being archived, HospitalRun provides valuable reference implementations for:

1. **Offline-First Clinical Architecture:** PouchDB/CouchDB patterns for disconnected environments
2. **Resource-Constrained UX:** UI patterns designed for low-bandwidth, low-power environments
3. **Electron-Based Clinical Desktop:** Patterns for hybrid web/desktop clinical applications
4. **Custom Form Builder:** Dynamic form generation for clinical data capture

> **Recommendation:** HospitalRun is **not recommended for new deployments** but serves as an important reference for:
> - Offline-first clinical application architecture
> - CouchDB/PouchDB sync patterns in healthcare
> - Resource-constrained environment UX design
> - Community members interested in forking and modernizing the codebase

---

### 1.5 LibreHealth (MPL-2.0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/LibreHealthIO](https://github.com/LibreHealthIO) |
| **License** | Mozilla Public License 2.0 (inherited OpenEMR code under GPL-2.0+) |
| **GitHub Stars** | 500+ (lh-ehr); 300+ (lh-ehr-laravel); 20+ (lh-toolkit) |
| **Language** | PHP, JavaScript (Laravel, Vue.js modern rewrite) |
| **First Release** | 2017 (forked from OpenEMR) |
| **Latest Activity** | Moderate -- Laravel-based rewrite in progress |
| **Community** | Software Freedom Conservancy member; former OpenEMR contributors |

#### Overview

LibreHealth EHR is a free and open-source electronic health records and medical practice management application, forked from OpenEMR by current and former OpenEMR contributors. The project is part of the Software Freedom Conservancy family and collaborates closely with the LibreHealth umbrella organization, which also maintains the LibreHealth Toolkit (a software API for building EHR systems) and LibreHealth Radiology (RIS/PACS).

#### Key Features

- **EHR Core:** Patient demographics, charting, scheduling, billing (inherited from OpenEMR)
- **LibreHealth Toolkit:** API framework for building custom EHR systems with FHIR support
- **Modern Rewrite:** Active Laravel/Vue.js rewrite for improved architecture
- **FHIR Analytics:** Analytics layer for FHIR-based population health queries
- **Modular Architecture:** Laravel modules for extensible clinical functionality
- **Multi-Database:** MySQL, MariaDB, PostgreSQL support
- **Patient Portal:** Self-service portal for appointments, records, communications

#### Tech Stack (Modern Laravel Rewrite)

| Layer | Technology |
|-------|------------|
| **Frontend** | JavaScript, Vue.js, Tailwind CSS, HTML |
| **Backend** | PHP, Laravel, Inertia.js |
| **Database** | MySQL 5.7+, MariaDB 10.3+, PostgreSQL |
| **Caching** | Redis 3.0+ |
| **Web Server** | Apache 2.2+, Nginx |

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Maturity** | 6/10 | Toolkit provides FHIR foundations; EHR FHIR integration improving |
| **Patient Safety** | 7/10 | Inherits OpenEMR clinical decision support |
| **Accessibility** | 6/10 | Varies by module; improving in modern rewrite |
| **Audit & Compliance** | 7/10 | Comprehensive audit logging |
| **Scalability** | 7/10 | Laravel foundation provides modern scalability patterns |
| **Interoperability** | 7/10 | FHIR API, HL7 support via toolkit |

#### Integration Path

```typescript
// Example: LibreHealth FHIR API (Laravel)
const libreHealthFhirClient = {
  baseUrl: 'https://librehealth-instance.example.com/api/fhir',

  async getPatient(patientId: string, apiToken: string) {
    const response = await fetch(`${this.baseUrl}/Patient/${patientId}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/fhir+json',
      },
    });
    if (!response.ok) throw new Error(`FHIR Error: ${response.status}`);
    return response.json();
  },

  async searchPatients(params: Record<string, string>, apiToken: string) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseUrl}/Patient?${queryString}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    });
    return response.json();
  },
};
```

> **Recommendation:** LibreHealth is suitable for organizations that want an **OpenEMR-compatible system with a modern Laravel/Vue.js architecture**. The Software Freedom Conservancy backing provides legal protection and governance. Consider for new implementations that can benefit from the modern tech stack while maintaining compatibility with the OpenEMR ecosystem.

---

## Section 1 Summary: EHR Platform Comparison

| Feature | OpenEMR | OpenMRS | GNU Health | HospitalRun | LibreHealth |
|---------|---------|---------|------------|-------------|-------------|
| **License** | GPL-3.0 | MPL-2.0 | GPL-3.0 | MIT (Archived) | MPL-2.0 |
| **Stars** | 8,500+ | 1,200+ | 500+ | 6,500+ (archived) | 800+ total |
| **FHIR Support** | 30+ resources | Good | Limited | None | 6/10 |
| **Language** | PHP/JS | Java/React | Python/Tryton | JS/TS | PHP/Laravel |
| **Offline-First** | No | Partial | No | Yes | No |
| **Global Health** | Moderate | Excellent | Excellent | Good | Moderate |
| **Patient Portal** | Yes | Yes | Limited | No | Yes |
| **ONC Certified** | Yes | No | No | No | No |
| **Active Development** | Yes | Yes | Yes | No | Moderate |
| **Clinical OS Fit** | Excellent | Good | Good | N/A | Good |

---

## Section 2: Dashboard Frameworks

> Dashboard frameworks provide the foundational UI architecture for Clinical OS applications. In healthcare, dashboards must handle complex data relationships, role-based views, real-time updates, and strict accessibility requirements while maintaining high information density with low cognitive load.

---

### 2.1 React Admin (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/marmelab/react-admin](https://github.com/marmelab/react-admin) |
| **License** | MIT License |
| **GitHub Stars** | 26,500+ |
| **Language** | TypeScript, React |
| **Maintainer** | Marmelab (professional open-source company) |
| **First Release** | 2016 |
| **Latest Activity** | Very active -- weekly releases, weekly blog updates |
| **Enterprise Edition** | Available (RAEE) with RBAC, audit log, calendar, real-time |

#### Overview

React Admin is a frontend framework for building data-driven administration applications on top of REST or GraphQL APIs. Built with TypeScript, React, and Material UI, it provides a comprehensive set of hooks and components for authentication, routing, forms, data grids, search, relationships, validation, and theming. Marmelab has sponsored and maintained the project since 2016.

#### Key Features

- **Backend Agnostic:** Connects to any REST or GraphQL API via 45+ data provider adapters
- **170+ Hooks and Components:** Authentication, routing, forms, datagrids, filters, relationships, validation, rich text, i18n, notifications, menus, theming, caching
- **TypeScript First:** Full type safety with IDE autocompletion
- **Accessibility:** Accessible, responsive, secure, fast, testable components
- **Optimistic UI:** Optimistic rendering, filter-as-you-type, undo functionality
- **Complete Customization:** Replace any component with your own
- **Data Provider Architecture:** Pluggable data layer for any backend

#### Clinical-Relevant Components

| Component | Clinical OS Use Case |
|-----------|---------------------|
| `<Datagrid>` | Patient lists, medication tables, appointment schedules |
| `<FilterForm>` | Patient search, lab result filtering, encounter queries |
| `<SimpleForm>` / `<TabbedForm>` | Clinical documentation, patient registration, order entry |
| `<ReferenceInput>` | Provider selection, medication lookup, diagnosis codes |
| `<AutocompleteInput>` | ICD-10/CPT code search, provider directory lookup |
| `<DateTimeInput>` | Appointment scheduling, encounter timestamps |
| `<ArrayInput>` | Multiple medication orders, problem list management |
| `<Edit>` / `<Create>` / `<Show>` | Patient chart views, result review, clinical notes |
| `<List>` | Patient census, task lists, queue management |
| `<Dashboard>` | Clinical overview, KPI metrics, population health |

#### Data Provider Architecture (Critical for FHIR)

React Admin's data provider pattern is ideal for FHIR APIs:

```typescript
// FHIR Data Provider for React Admin
import { DataProvider } from 'react-admin';

const fhirDataProvider: DataProvider = {
  getList: async (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;
    const filters = params.filter;

    const queryParams = new URLSearchParams({
      _count: String(perPage),
      _getpagesoffset: String((page - 1) * perPage),
      _sort: order === 'ASC' ? field : `-${field}`,
      ...buildFhirSearchParams(filters),
    });

    const response = await fetch(
      `${FHIR_BASE_URL}/${resource}?${queryParams}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const bundle = await response.json();
    return {
      data: bundle.entry?.map((e: any) => ({
        id: e.resource.id,
        ...e.resource,
      })) || [],
      total: bundle.total || 0,
    };
  },

  getOne: async (resource, params) => {
    const response = await fetch(
      `${FHIR_BASE_URL}/${resource}/${params.id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await response.json();
    return { data: { id: data.id, ...data } };
  },

  getMany: async (resource, params) => {
    // Batch retrieval for references
    const ids = params.ids.join(',');
    const response = await fetch(
      `${FHIR_BASE_URL}/${resource}?_id=${ids}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const bundle = await response.json();
    return {
      data: bundle.entry?.map((e: any) => ({
        id: e.resource.id,
        ...e.resource,
      })) || [],
    };
  },

  // ... create, update, delete, getManyReference
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Integration** | 9/10 | Data provider pattern maps perfectly to FHIR APIs |
| **Accessibility** | 8/10 | Material UI accessibility; keyboard navigation supported |
| **Information Density** | 8/10 | Dense datagrids, customizable layouts |
| **Role-Based Access** | 9/10 | Enterprise edition includes RBAC; open source supports custom auth |
| **Clinical Workflow** | 8/10 | CRUD-focused; clinical workflows require custom development |
| **Enterprise Readiness** | 9/10 | Professional support, extensive documentation, active development |

#### Integration Path

1. **Install React Admin:** `npm install react-admin`
2. **Implement FHIR Data Provider:** Map React Admin CRUD operations to FHIR APIs
3. **Configure Authentication:** Integrate SMART on FHIR OAuth flow
4. **Build Clinical Resources:** Create React Admin resources for Patient, Observation, Encounter, etc.
5. **Customize Theme:** Apply clinical color scheme, high-contrast mode
6. **Add Enterprise Features:** RBAC, audit logging, real-time updates (RAEE or custom)

> **Recommendation:** React Admin is an excellent choice for Clinical OS builds requiring a **mature, well-documented, enterprise-ready dashboard framework** with strong CRUD patterns. The data provider architecture is a natural fit for FHIR APIs. Best suited for administrative and clinical data management interfaces.

---

### 2.2 Refine (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/refinedev/refine](https://github.com/refinedev/refine) |
| **License** | MIT License |
| **GitHub Stars** | 34,100+ |
| **Language** | TypeScript, React |
| **Maintainer** | Refine Development Inc. |
| **First Release** | 2021 |
| **Latest Activity** | Very active -- frequent releases, active Discord community |

#### Overview

Refine is a React framework for building internal tools, admin panels, dashboards, and B2B applications with unmatched flexibility. It shines on data-intensive enterprise applications, providing headless architecture that gives developers full control over UI while handling complex data operations, authentication, and access control. With built-in SSR support via Next.js and Remix, it can also power customer-facing applications.

#### Key Features

- **Headless Architecture:** Full control over UI -- bring your own design system
- **15+ Backend Connectors:** REST API, GraphQL, NestJS CRUD, Airtable, Strapi, Supabase, Hasura, Firebase, etc.
- **SSR Support:** Next.js and Remix integration for server-side rendering
- **Advanced Routing:** Works with any router library (React Router, TanStack Router, etc.)
- **Auto CRUD UI:** Automatic generation of CRUD interfaces based on API structure
- **React Query Integration:** Powerful state management and mutations via TanStack Query
- **Authentication & Access Control:** Built-in providers for auth flows and permission management
- **Real-Time Support:** Out-of-the-box live/real-time application support
- **Audit Logs & Versioning:** Document versioning and audit trail capabilities
- **Devtools:** Built-in developer tools for debugging and insights

#### Clinical-Relevant Features

| Feature | Clinical OS Application |
|---------|------------------------|
| **Headless Design** | Full control over clinical UI patterns; no design system lock-in |
| **Real-Time Updates** | Live patient monitor feeds, real-time bed availability |
| **SSR/Next.js** | SEO for patient portal; fast initial load for critical clinical data |
| **Multi-Tenancy** | Multi-hospital deployments, departmental isolation |
| **Audit Logging** | Clinical audit trails, HIPAA compliance documentation |
| **Fine-Grained Access Control** | Role-based access per clinical module, patient consent management |

#### Refine Architecture for Clinical OS

```typescript
// Refine app with FHIR data provider and clinical layout
import { Refine } from '@refinedev/core';
import { DevtoolsProvider } from '@refinedev/devtools';
import { RefineKbarProvider } from 'refine-kbar';
import routerProvider from '@refinedev/react-router-v6';

// Clinical-specific imports
import { fhirDataProvider } from './providers/fhirDataProvider';
import { clinicalAuthProvider } from './providers/clinicalAuthProvider';
import { accessControlProvider } from './providers/accessControlProvider';
import { ClinicalLayout } from './components/layout/ClinicalLayout';
import { notificationProvider } from './providers/notificationProvider';

// Clinical resources
import { PatientList, PatientShow, PatientEdit } from './pages/patients';
import { EncounterList, EncounterShow } from './pages/encounters';
import { ObservationList } from './pages/observations';
import { MedicationList } from './pages/medications';
import { Dashboard } from './pages/dashboard';

function App() {
  return (
    <DevtoolsProvider>
      <RefineKbarProvider>
        <Refine
          dataProvider={fhirDataProvider}
          routerProvider={routerProvider}
          authProvider={clinicalAuthProvider}
          accessControlProvider={accessControlProvider}
          notificationProvider={notificationProvider}
          resources={[
            {
              name: 'dashboard',
              list: '/',
              meta: { label: 'Clinical Dashboard', icon: <DashboardIcon /> },
            },
            {
              name: 'Patient',
              list: '/patients',
              show: '/patients/show/:id',
              edit: '/patients/edit/:id',
              create: '/patients/create',
              meta: { label: 'Patients', icon: <PatientIcon /> },
            },
            {
              name: 'Encounter',
              list: '/encounters',
              show: '/encounters/show/:id',
              meta: { label: 'Encounters', icon: <EncounterIcon /> },
            },
            {
              name: 'Observation',
              list: '/observations',
              meta: { label: 'Lab Results', icon: <LabIcon /> },
            },
            {
              name: 'MedicationRequest',
              list: '/medications',
              meta: { label: 'Medications', icon: <MedicationIcon /> },
            },
          ]}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
            useNewQueryKeys: true,
            projectId: 'clinical-os',
          }}
        >
          <ClinicalLayout />
        </Refine>
      </RefineKbarProvider>
    </DevtoolsProvider>
  );
}
```

#### FHIR Data Provider Implementation

```typescript
import type { DataProvider } from '@refinedev/core';
import { QueryClient } from '@tanstack/react-query';

const FHIR_BASE = process.env.REACT_APP_FHIR_BASE_URL;
const queryClient = new QueryClient();

export const fhirDataProvider: DataProvider = {
  getList: async ({ resource, pagination, filters, sorters, meta }) => {
    const params = new URLSearchParams();

    // Pagination (_count and _offset for FHIR)
    if (pagination) {
      params.set('_count', String(pagination.pageSize || 20));
      params.set('_getpagesoffset', String(
        ((pagination.current || 1) - 1) * (pagination.pageSize || 20)
      ));
    }

    // Sorting
    if (sorters?.length) {
      const sortExpr = sorters
        .map((s) => `${s.order === 'desc' ? '-' : ''}${s.field}`)
        .join(',');
      params.set('_sort', sortExpr);
    }

    // Filters (FHIR search parameters)
    if (filters) {
      filters.forEach((f) => {
        params.set(f.field, String(f.value));
      });
    }

    // Include referenced resources (e.g., Patient with Encounter)
    if (meta?.includes) {
      meta.includes.forEach((inc: string) => params.append('_include', inc));
    }

    const response = await fetch(`${FHIR_BASE}/${resource}?${params}`, {
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        Accept: 'application/fhir+json',
      },
    });

    const bundle = await response.json();
    return {
      data: bundle.entry?.map((e: any) => ({
        id: e.resource.id,
        ...e.resource,
      })) || [],
      total: bundle.total ?? bundle.entry?.length ?? 0,
    };
  },

  getOne: async ({ resource, id, meta }) => {
    const response = await fetch(`${FHIR_BASE}/${resource}/${id}`, {
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        Accept: 'application/fhir+json',
      },
    });
    const data = await response.json();
    return { data: { id: data.id, ...data } };
  },

  create: async ({ resource, variables, meta }) => {
    const response = await fetch(`${FHIR_BASE}/${resource}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/fhir+json',
      },
      body: JSON.stringify({
        resourceType: resource,
        ...variables,
      }),
    });
    const data = await response.json();
    return { data: { id: data.id, ...data } };
  },

  update: async ({ resource, id, variables, meta }) => {
    // FHIR update requires full resource
    const response = await fetch(`${FHIR_BASE}/${resource}/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/fhir+json',
      },
      body: JSON.stringify({
        resourceType: resource,
        id,
        ...variables,
      }),
    });
    const data = await response.json();
    return { data: { id: data.id, ...data } };
  },

  deleteOne: async ({ resource, id, meta }) => {
    await fetch(`${FHIR_BASE}/${resource}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await getAccessToken()}` },
    });
    return { data: { id } };
  },

  getApiUrl: () => FHIR_BASE,
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Integration** | 9/10 | Headless architecture perfect for custom FHIR data providers |
| **Accessibility** | 8/10 | Headless -- depends on chosen UI library; react-aria recommended |
| **Information Density** | 9/10 | Full layout control; optimized for clinical data density |
| **Role-Based Access** | 9/10 | Built-in access control provider with fine-grained permissions |
| **Clinical Workflow** | 8/10 | Requires custom workflow components; highly flexible |
| **Enterprise Readiness** | 9/10 | Professional support, active development, comprehensive docs |

#### Integration Path

1. **Create Refine App:** `npm create refine-app@latest`
2. **Implement FHIR Data Provider:** Map all FHIR CRUD operations
3. **Configure Authentication:** SMART on FHIR OAuth integration
4. **Build Clinical Layout:** Custom sidebar, header, notification areas
5. **Implement Resources:** Patient, Encounter, Observation, etc.
6. **Add Access Control:** Role-based permissions per clinical module
7. **Integrate UI Library:** shadcn/ui, Radix, or react-aria for accessible components

> **Recommendation:** Refine is the **top recommendation** for Clinical OS dashboards requiring **maximum flexibility** and **headless architecture control**. Its 34k+ stars, active community, and data-intensive design make it ideal for clinical environments. Best paired with shadcn/ui or Radix UI primitives for accessible healthcare components.

---

### 2.3 Tabler (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/tabler/tabler](https://github.com/tabler/tabler) |
| **License** | MIT License |
| **GitHub Stars** | 40,800+ |
| **Language** | HTML, Bootstrap 5, JavaScript |
| **Maintainer** | CodeCalm (Pawe? Kuna) + community |
| **First Release** | 2018 |
| **Latest Activity** | Very active -- regular updates, growing community |

#### Overview

Tabler is a free and open-source HTML Dashboard UI Kit built on Bootstrap 5. With over 40,800 GitHub stars, it is one of the most popular admin dashboard templates. It provides a premium-quality, responsive, and high-quality UI with 6,074 custom SVG icons, multiple layout options, and a comprehensive set of components. While primarily an HTML/CSS template, it has strong React integrations and serves as an excellent design reference.

#### Key Features

- **6,074 Custom SVG Icons:** Purpose-built for dashboard and admin contexts (Tabler Icons)
- **Multiple Layout Options:** Vertical, horizontal, condensed, dark mode, RTL, boxed, fluid
- **Bootstrap 5 Foundation:** Well-known, well-documented CSS framework
- **20+ Pre-built Pages:** Dashboard, settings, users, authentication, error pages
- **Plugin Ecosystem:** Charts, calendars, data tables, maps, editors, dropzones
- **Fully Responsive:** Mobile, tablet, and desktop optimization
- **Cross-Browser:** Chrome, Firefox, Safari, Opera, Edge
- **Dark Mode:** Native Bootstrap 5.3 dark mode support
- **Clean Code:** W3C valid, handwritten, Bootstrap-guideline compliant
- **Premium Version:** Pro version with additional templates and illustrations

#### Layout Options for Clinical OS

| Layout | Clinical OS Application |
|--------|------------------------|
| **Vertical (Default)** | Standard clinical dashboard with collapsible sidebar navigation |
| **Condensed** | High-density clinical workstations with limited screen space |
| **Dark Mode** | Night shift clinical environments, radiology reading rooms |
| **RTL** | Arabic, Hebrew, and other right-to-left language deployments |
| **Horizontal** | Wide clinical overview dashboards with top-level navigation |
| **Navbar Overlap** | Immersive clinical data views with overlaid navigation |

#### Clinical UI Components

Tabler provides pre-built patterns ideal for clinical interfaces:

- **Data Tables:** Sortable, filterable clinical data grids with pagination
- **Cards:** Patient summary cards, metric cards, alert cards
- **Charts:** ApexCharts integration for clinical trend visualization
- **Calendar:** FullCalendar for appointment and schedule management
- **Forms:** Comprehensive form components for clinical data entry
- **Authentication:** Login, registration, password reset pages
- **Error Pages:** 404, 500, maintenance pages
- **Settings:** User preference panels, system configuration
- **Wizard Components:** Multi-step clinical workflows (admission, assessment)

#### Tabler React Integration

While Tabler is HTML/CSS, it integrates well with React-based Clinical OS:

```tsx
// Tabler-styled clinical sidebar navigation
import { NavLink } from 'react-router-dom';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  badge?: { text: string; color: string };
  children?: NavItem[];
}

const ClinicalSidebar = ({ navigation }: { navigation: NavItem[] }) => {
  return (
    <aside className="navbar navbar-vertical navbar-expand-lg">
      <div className="container-fluid">
        <button className="navbar-toggler" type="button">
          <span className="navbar-toggler-icon" />
        </button>
        <h1 className="navbar-brand">
          <a href="/">
            <img src="/clinical-os-logo.svg" alt="Clinical OS" />
          </a>
        </h1>
        <div className="collapse navbar-collapse">
          <ul className="navbar-nav pt-lg-3">
            {navigation.map((item) => (
              <li key={item.path} className={`nav-item${item.children ? ' dropdown' : ''}`}>
                <NavLink
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' active' : ''}`
                  }
                  to={item.path}
                >
                  <span className={`nav-link-icon d-md-none d-lg-inline-block ${item.icon}`} />
                  <span className="nav-link-title">{item.label}</span>
                  {item.badge && (
                    <span className={`badge bg-${item.badge.color} ms-auto`}>
                      {item.badge.text}
                    </span>
                  )}
                </NavLink>
                {item.children && (
                  <div className="dropdown-menu">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.path}
                        className="dropdown-item"
                        to={child.path}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Integration** | 4/10 | Template-level; requires React wrapper and FHIR data layer |
| **Accessibility** | 7/10 | Bootstrap 5 a11y; WCAG 2.1 AA requires additional work |
| **Information Density** | 8/10 | Dense Bootstrap grids; card-based layouts for clinical data |
| **Role-Based Access** | 4/10 | Template only; auth logic must be built |
| **Clinical Workflow** | 6/10 | Pre-built pages accelerate development; workflows need custom build |
| **Enterprise Readiness** | 7/10 | Mature Bootstrap ecosystem; professional design quality |

#### Integration Path

1. **Install Tabler:** `npm install @tabler/core` or use CDN
2. **React Wrapper:** Integrate with React via `@tabler/react` or custom wrappers
3. **Add FHIR Data Layer:** Connect to FHIR APIs via Refine or React Admin data provider
4. **Clinical Theming:** Customize colors for clinical context (calm blues, alerts in red/amber)
5. **Build Layout:** Use Tabler layout components for sidebar, header, content areas
6. **Add Clinical Pages:** Dashboard, patient list, encounter views, settings

> **Recommendation:** Tabler is recommended as a **UI design foundation and icon library** rather than a complete dashboard framework. Its 6,000+ icons are invaluable for clinical interfaces. Best used in combination with Refine or React Admin for the data layer, with Tabler providing the visual design system and iconography.

---

### 2.4 AdminJS (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/SoftwareBrothers/adminjs](https://github.com/SoftwareBrothers/adminjs) |
| **License** | MIT License |
| **GitHub Stars** | 8,900+ |
| **Language** | TypeScript, React, Node.js |
| **Maintainer** | RST Software (rst.software) |
| **First Release** | 2018 (originally AdminBro) |
| **Latest Activity** | Active -- regular releases, plugin ecosystem |

#### Overview

AdminJS is an auto-generated admin panel framework for Node.js applications. By providing database models (ORM entities, Prisma schemas, or MongoDB collections), AdminJS automatically generates a full-featured admin interface with CRUD operations, filtering, searching, and relationship management. It is particularly suited for applications with well-defined data models that need rapid admin panel generation.

#### Key Features

- **Auto-Generated UI:** Automatic CRUD interfaces from database models
- **Multi-ORM Support:** TypeORM, Sequelize, Prisma, Mongoose, MikroORM
- **Framework Integration:** Express, Fastify, NestJS, Adonis, Hapi adapters
- **Custom Components:** Replace auto-generated UI with custom React components
- **Role-Based Access:** Built-in access control with custom actions
- **Custom Actions:** Beyond CRUD -- custom business logic integration
- **Dashboard Widgets:** Customizable dashboard with data widgets
- **File Upload:** Built-in file upload with multiple storage providers
- **Import/Export:** CSV/JSON data import and export functionality

#### Clinical OS Application

AdminJS can serve as the **administrative backend** of a Clinical OS, handling:

- **User Management:** Provider accounts, role assignment, permission management
- **System Configuration:** Clinic settings, workflow configuration, form builder
- **Reference Data Management:** ICD-10 codes, medication formularies, lab test catalogs
- **Audit Log Review:** Administrative review of clinical audit trails
- **Report Management:** Report template configuration, scheduled report administration
- **Integration Management:** HL7 interface configuration, FHIR endpoint management

```typescript
// AdminJS with clinical resources (TypeORM example)
import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import { Database, Resource } from '@adminjs/typeorm';
import { User } from './entities/User';
import { Patient } from './entities/Patient';
import { Encounter } from './entities/Encounter';
import { Observation } from './entities/Observation';

AdminJS.registerAdapter({ Database, Resource });

const adminJs = new AdminJS({
  resources: [
    {
      resource: User,
      options: {
        navigation: { name: 'Administration', icon: 'User' },
        properties: {
          password: { isVisible: { list: false, filter: false, show: false, edit: false } },
        },
        actions: {
          new: { isAccessible: ({ currentAdmin }) => currentAdmin.role === 'admin' },
          delete: { isAccessible: ({ currentAdmin }) => currentAdmin.role === 'admin' },
        },
      },
    },
    {
      resource: Patient,
      options: {
        navigation: { name: 'Clinical', icon: 'Heart' },
        properties: {
          id: { isVisible: { list: true, show: true, edit: false, filter: true } },
          name: { isVisible: true, isTitle: true },
          dateOfBirth: { isVisible: true },
          mrn: { label: 'Medical Record Number' },
        },
      },
    },
    {
      resource: Encounter,
      options: {
        navigation: { name: 'Clinical', icon: 'Activity' },
        listProperties: ['id', 'patientId', 'date', 'type', 'status'],
        filterProperties: ['patientId', 'type', 'status', 'date'],
      },
    },
    {
      resource: Observation,
      options: {
        navigation: { name: 'Clinical', icon: 'TrendingUp' },
        properties: {
          valueQuantity: { type: 'mixed' },
          referenceRange: { type: 'mixed' },
        },
      },
    },
  ],
  dashboard: {
    component: AdminJS.bundle('./components/ClinicalDashboard'),
  },
  branding: {
    companyName: 'Clinical OS',
    logo: '/clinical-os-logo.svg',
    favicon: '/favicon.svg',
  },
  locale: {
    translations: {
      labels: {
        Patient: 'Patients',
        Encounter: 'Encounters',
        Observation: 'Lab Results & Vitals',
      },
    },
  },
});

const adminRouter = AdminJSExpress.buildAuthenticatedRouter(
  adminJs,
  {
    authenticate: async (email, password) => {
      // Clinical-grade authentication with audit logging
      const user = await authenticateClinicalUser(email, password);
      if (user) {
        await logAuditEvent('ADMIN_LOGIN', user.id, { email });
        return user;
      }
      return null;
    },
    cookieName: 'clinical-os-admin',
    cookiePassword: process.env.ADMIN_COOKIE_SECRET,
  }
);
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Integration** | 5/10 | Requires ORM-to-FHIR mapping layer |
| **Accessibility** | 6/10 | Basic a11y; requires customization for clinical compliance |
| **Information Density** | 7/10 | Good datagrid density; customizable layouts |
| **Role-Based Access** | 8/10 | Built-in access control with custom action permissions |
| **Clinical Workflow** | 6/10 | Admin-focused; clinical workflows need significant custom work |
| **Enterprise Readiness** | 7/10 | Good documentation; professional support available |

#### Integration Path

1. **Install AdminJS:** `npm install adminjs @adminjs/express @adminjs/typeorm`
2. **Define Clinical Entities:** TypeORM entities for Patient, Encounter, etc.
3. **Configure Admin Panel:** Resource definitions with clinical labels and navigation
4. **Add Authentication:** Clinical-grade auth with audit logging
5. **Customize UI:** Override components for clinical workflows
6. **Build Dashboard:** Custom dashboard widgets for clinical KPIs

> **Recommendation:** AdminJS is best suited for the **administrative and operational backend** of a Clinical OS -- user management, system configuration, reference data management, and audit log review. It is not recommended as the primary clinical interface for patient care workflows but excels as an operational administration tool.

---

### 2.5 Appsmith (Apache-2.0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/appsmithorg/appsmith](https://github.com/appsmithorg/appsmith) |
| **License** | Apache License 2.0 |
| **GitHub Stars** | 34,000+ |
| **Language** | Java, TypeScript, React |
| **Maintainer** | Appsmith Inc. ($51M+ funded) |
| **First Release** | 2019 |
| **Latest Activity** | Very active -- largest open-source internal tool builder community |

#### Overview

Appsmith is an open-source low-code platform for building admin panels, internal tools, dashboards, and operational workflows. It provides a visual canvas for placing UI widgets (tables, forms, charts, buttons), connecting them to data through SQL or JavaScript, and deploying applications to teams. With 25+ native data connectors and the most permissive Apache 2.0 license, Appsmith is the most popular open-source internal tool platform.

#### Key Features

- **25+ Data Connectors:** PostgreSQL, MySQL, MongoDB, Elasticsearch, Redis, Snowflake, BigQuery, REST, GraphQL, Google Sheets
- **Visual Builder:** Drag-and-drop UI construction with code-level control
- **SQL & JavaScript:** Real SQL queries and JavaScript for data transformation and logic
- **Git Version Control:** Native Git integration for branching, code review, and merge workflows
- **Self-Hosted or Cloud:** Docker, Kubernetes, AWS AMI, or Appsmith Cloud
- **Role-Based Access:** Granular permissions for building, deploying, and using applications
- **SSO/SAML:** Enterprise authentication (Business/Enterprise plans)
- **JavaScript Everywhere:** Queries, UI events, data bindings, custom logic
- **Embedding:** Appsmith apps embeddable in existing web applications

#### Clinical OS Applications

| Use Case | Appsmith Application |
|----------|---------------------|
| **Operational Dashboards** | Bed management, OR scheduling, resource allocation |
| **Quality Reporting** | Clinical quality metrics, readmission rates, infection tracking |
| **Inventory Management** | Medication inventory, supply chain, equipment tracking |
| **Staff Management** | Provider schedules, credentialing tracking, training compliance |
| **Financial Operations** | Claims tracking, revenue cycle, payer mix analysis |
| **Data Migration Tools** | ETL monitoring, data quality dashboards, sync status |

#### Clinical Dashboard Example

Appsmith's low-code approach enables rapid development of operational dashboards:

```javascript
// Appsmith JS Object for clinical bed management
export default {
  // Fetch bed occupancy data
  async getBedOccupancy() {
    const query = `
      SELECT 
        ward,
        COUNT(*) as total_beds,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved,
        SUM(CASE WHEN status = 'cleaning' THEN 1 ELSE 0 END) as cleaning,
        ROUND(
          SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 
          1
        ) as occupancy_rate
      FROM beds
      WHERE facility_id = {{appsmith.store.facilityId}}
      GROUP BY ward
      ORDER BY occupancy_rate DESC;
    `;
    return await BedOccupancyQuery.run({ query });
  },

  // Get patients awaiting discharge
  async getPendingDischarges() {
    return await PendingDischargesQuery.run({
      query: `
        SELECT 
          p.mrn,
          p.name,
          e.admission_date,
          e.expected_discharge_date,
          DATEDIFF(CURRENT_DATE, e.expected_discharge_date) as days_overdue,
          e.attending_physician
        FROM encounters e
        JOIN patients p ON e.patient_id = p.id
        WHERE e.status = 'active'
          AND e.expected_discharge_date <= CURRENT_DATE
        ORDER BY days_overdue DESC;
      `
    });
  },

  // Calculate occupancy color coding
  getOccupancyColor(rate) {
    if (rate >= 95) return '#DC2626'; // Red - critical
    if (rate >= 85) return '#F59E0B'; // Amber - warning
    return '#10B981'; // Green - normal
  },

  // Refresh data interval
  startAutoRefresh() {
    setInterval(() => {
      this.getBedOccupancy();
      this.getPendingDischarges();
    }, 60000); // Refresh every minute
  }
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **FHIR Integration** | 6/10 | REST/GraphQL connectors can call FHIR APIs; no native FHIR support |
| **Accessibility** | 6/10 | Basic widget a11y; clinical-grade a11y requires custom components |
| **Information Density** | 7/10 | Flexible layouts; density depends on widget configuration |
| **Role-Based Access** | 8/10 | Built-in RBAC; SSO/SAML on enterprise tier |
| **Clinical Workflow** | 5/10 | Operational dashboards only; not suitable for clinical care workflows |
| **Enterprise Readiness** | 9/10 | SOC 2 Type II, HIPAA compliance (Enterprise), professional support |

#### Integration Path

1. **Deploy Appsmith:** Docker or Kubernetes self-hosted deployment
2. **Connect Data Sources:** PostgreSQL clinical database, FHIR API via REST connector
3. **Build Dashboards:** Drag-and-drop widgets for operational KPIs
4. **Add Logic:** JavaScript for data transformation and business rules
5. **Configure Access:** Role-based permissions per dashboard
6. **Embed or Share:** Deploy to clinical operations teams

> **Recommendation:** Appsmith is recommended for **clinical operations dashboards, quality reporting, and administrative tools** -- not for clinical care interfaces. Its low-code approach enables rapid development of operational dashboards by clinical informaticists and data analysts. The Apache 2.0 license is the most permissive for enterprise healthcare use.

---

## Section 2 Summary: Dashboard Framework Comparison

| Feature | React Admin | Refine | Tabler | AdminJS | Appsmith |
|---------|-------------|--------|--------|---------|----------|
| **License** | MIT | MIT | MIT | MIT | Apache-2.0 |
| **Stars** | 26,500+ | 34,100+ | 40,800+ | 8,900+ | 34,000+ |
| **Architecture** | Component Library | Headless Framework | HTML Template | Auto-Generated | Low-Code Platform |
| **FHIR Ready** | Excellent | Excellent | Requires Layer | Good | Moderate |
| **TypeScript** | Yes | Yes | JS/HTML | Yes | Yes |
| **Accessibility** | Good | Excellent* | Good | Moderate | Moderate |
| **Customization** | High | Very High | High | Moderate | Low |
| **Dev Speed** | Fast | Fast | Medium | Very Fast | Very Fast |
| **Clinical Fit** | Excellent | Excellent | Design Foundation | Admin Only | Operations Only |
| **Enterprise** | Yes (paid) | Yes | N/A | Yes | Yes (paid) |

*Accessibility depends on chosen UI primitives (react-aria recommended)

---

## Section 3: Navigation Components

> Navigation in clinical systems must account for high cognitive load, frequent interruptions, time pressure, and the critical nature of clinical tasks. Navigation patterns must be role-aware (physician vs. nurse vs. administrator), context-sensitive (ED vs. ICU vs. clinic), and always accessible (keyboard-only operation during sterile procedures).

---

### 3.1 react-pro-sidebar (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | Multiple implementations (see below) |
| **License** | MIT License |
| **GitHub Stars** | 3,900+ (azouaoui-med/react-pro-sidebar) |
| **Language** | React, TypeScript |
| **Maintainer** | Community (multiple forks) |

#### Overview

react-pro-sidebar is a set of React components for creating collapsible sidebar navigation with dropdown menus, multi-level hierarchies, and RTL support. The most popular implementation (by azouaoui-med) provides a high-level, customizable sidebar component that serves as the primary navigation pattern for admin dashboards and clinical operating systems.

#### Key Features

- **Collapsible Sidebar:** Minimize/expand with smooth animations
- **Multi-Level Menu:** Nested navigation with dropdown submenus
- **RTL Support:** Right-to-left language support for global deployments
- **Customizable Styling:** Full CSS customization via styled-components or CSS modules
- **Responsive Design:** Mobile-friendly with overlay mode
- **Active State Management:** Built-in active route highlighting
- **Icon Support:** Compatible with all React icon libraries
- **TypeScript Support:** Full type definitions

#### Clinical OS Sidebar Pattern

```tsx
// Clinical OS sidebar with role-based navigation
import { Sidebar, Menu, MenuItem, SubMenu } from 'react-pro-sidebar';
import { useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

// Health Icons for clinical navigation
import { 
  HiOutlineHome,
  HiOutlineUsers,
  HiOutlineBeaker,
  HiOutlineClipboardDocumentList,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: string[];
  children?: NavItem[];
  badge?: number;
}

const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    icon: <HiOutlineHome />,
    roles: ['physician', 'nurse', 'admin', 'pharmacist', 'radiologist'],
  },
  {
    label: 'Patients',
    path: '/patients',
    icon: <HiOutlineUsers />,
    roles: ['physician', 'nurse', 'admin'],
    badge: 0, // Active patient count
  },
  {
    label: 'Clinical',
    path: '/clinical',
    icon: <HiOutlineClipboardDocumentList />,
    roles: ['physician', 'nurse'],
    children: [
      { label: 'Encounters', path: '/clinical/encounters', icon: null, roles: ['physician', 'nurse'] },
      { label: 'Orders', path: '/clinical/orders', icon: null, roles: ['physician'], badge: 0 },
      { label: 'Vitals', path: '/clinical/vitals', icon: null, roles: ['nurse'] },
      { label: 'Medications', path: '/clinical/medications', icon: null, roles: ['physician', 'nurse', 'pharmacist'] },
    ],
  },
  {
    label: 'Laboratory',
    path: '/lab',
    icon: <HiOutlineBeaker />,
    roles: ['physician', 'nurse', 'lab_technician'],
    children: [
      { label: 'Results', path: '/lab/results', icon: null, roles: ['physician', 'nurse'] },
      { label: 'Pending Orders', path: '/lab/pending', icon: null, roles: ['lab_technician'], badge: 0 },
      { label: 'Specimen Tracking', path: '/lab/specimens', icon: null, roles: ['lab_technician'] },
    ],
  },
  {
    label: 'Scheduling',
    path: '/schedule',
    icon: <HiOutlineCalendar />,
    roles: ['physician', 'nurse', 'admin', 'scheduler'],
  },
  {
    label: 'Analytics',
    path: '/analytics',
    icon: <HiOutlineChartBar />,
    roles: ['physician', 'admin', 'quality_officer'],
    children: [
      { label: 'Population Health', path: '/analytics/population', icon: null, roles: ['quality_officer'] },
      { label: 'Quality Metrics', path: '/analytics/quality', icon: null, roles: ['quality_officer'] },
      { label: 'Provider Dashboard', path: '/analytics/provider', icon: null, roles: ['physician'] },
    ],
  },
  {
    label: 'Administration',
    path: '/admin',
    icon: <HiOutlineCog6Tooth />,
    roles: ['admin'],
    children: [
      { label: 'Users', path: '/admin/users', icon: null, roles: ['admin'] },
      { label: 'Settings', path: '/admin/settings', icon: null, roles: ['admin'] },
      { label: 'Audit Logs', path: '/admin/audit', icon: null, roles: ['admin'] },
    ],
  },
];

const ClinicalSidebar = ({ collapsed }: { collapsed: boolean }) => {
  const location = useLocation();
  const { user } = useAuth();

  // Filter navigation by user role
  const filteredNav = navigation.filter((item) =>
    item.roles.includes(user?.role)
  );

  return (
    <Sidebar collapsed={collapsed} transitionDuration={300}>
      <div className="clinical-logo">
        <img src="/clinical-os-logo.svg" alt="Clinical OS" />
        {!collapsed && <span>Clinical OS</span>}
      </div>
      <Menu
        menuItemStyles={{
          button: ({ level, active }) => ({
            backgroundColor: active ? '#E0F2FE' : 'transparent',
            color: active ? '#0369A1' : '#475569',
            fontWeight: active ? 600 : 400,
            paddingLeft: level === 0 ? '16px' : '32px',
            '&:hover': {
              backgroundColor: '#F1F5F9',
            },
          }),
        }}
      >
        {filteredNav.map((item) =>
          item.children ? (
            <SubMenu
              key={item.path}
              label={item.label}
              icon={item.icon}
              defaultOpen={location.pathname.startsWith(item.path)}
            >
              {item.children
                .filter((child) => child.roles.includes(user?.role))
                .map((child) => (
                  <MenuItem
                    key={child.path}
                    component={<Link to={child.path} />}
                    active={location.pathname === child.path}
                  >
                    {child.label}
                    {child.badge > 0 && (
                      <span className="badge badge-danger">{child.badge}</span>
                    )}
                  </MenuItem>
                ))}
            </SubMenu>
          ) : (
            <MenuItem
              key={item.path}
              component={<Link to={item.path} />}
              icon={item.icon}
              active={location.pathname === item.path}
            >
              {item.label}
              {item.badge > 0 && (
                <span className="badge badge-danger">{item.badge}</span>
              )}
            </MenuItem>
          )
        )}
      </Menu>
    </Sidebar>
  );
};

export default ClinicalSidebar;
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Accessibility** | 6/10 | Requires keyboard navigation enhancement |
| **Role-Based Views** | 7/10 | Can be combined with role filtering |
| **Clinical Workflow** | 7/10 | Good hierarchy for clinical module organization |
| **Responsiveness** | 7/10 | Collapsible and overlay modes for different devices |
| **Customization** | 8/10 | Highly customizable via CSS-in-JS |

> **Recommendation:** react-pro-sidebar is a solid choice for Clinical OS sidebar navigation when combined with role-based filtering and accessibility enhancements. Consider pairing with Radix UI's Collapsible primitive for improved keyboard navigation and screen reader support.

---

### 3.2 react-router-dom (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/remix-run/react-router](https://github.com/remix-run/react-router) |
| **License** | MIT License |
| **GitHub Stars** | 54,000+ (react-router monorepo) |
| **Language** | TypeScript |
| **Maintainer** | Shopify (Remix team) |
| **First Release** | 2014 (v1); v6 released 2021 |

#### Overview

react-router-dom is the de facto standard routing library for React applications. Maintained by the Remix team at Shopify, it provides declarative routing, nested routes, code splitting, data loading, and navigation management. React Router v6 introduced a hooks-based API, simplified nested routing, and `<Outlet>` components for layout composition.

#### Key Features

- **Declarative Routing:** Route configuration via JSX components
- **Nested Routes:** Hierarchical route definitions with layout inheritance
- **Code Splitting:** Lazy loading and route-based code splitting
- **Data Loading:** `loader` functions for route-level data fetching (Remix integration)
- **Actions:** Form submission handling with `action` functions
- **Navigation:** Programmatic and declarative navigation with `useNavigate`
- **Route Parameters:** Dynamic segments for patient IDs, encounter IDs, etc.
- **Protected Routes:** Authentication guards and role-based route access
- **Browser History:** Full integration with browser history API

#### Clinical OS Routing Pattern

```tsx
// Clinical OS router with role-based access and lazy loading
import { 
  createBrowserRouter, 
  RouterProvider, 
  Navigate,
  Outlet,
  useRouteError,
} from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { ClinicalLayout } from './components/layout/ClinicalLayout';
import { useAuth } from './hooks/useAuth';

// Lazy-loaded clinical modules
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PatientList = lazy(() => import('./pages/patients/PatientList'));
const PatientDetail = lazy(() => import('./pages/patients/PatientDetail'));
const EncounterList = lazy(() => import('./pages/encounters/EncounterList'));
const EncounterDetail = lazy(() => import('./pages/encounters/EncounterDetail'));
const OrderEntry = lazy(() => import('./pages/clinical/OrderEntry'));
const VitalsEntry = lazy(() => import('./pages/clinical/VitalsEntry'));
const LabResults = lazy(() => import('./pages/lab/LabResults'));
const Schedule = lazy(() => import('./pages/schedule/Schedule'));
const Analytics = lazy(() => import('./pages/analytics/Analytics'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Login = lazy(() => import('./pages/auth/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Route guard for authenticated routes
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <ClinicalSkeleton />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
};

// Route guard for role-based access
const RequireRole = ({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode; 
  allowedRoles: string[];
}) => {
  const { user } = useAuth();
  
  if (!allowedRoles.includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return <>{children}</>;
};

// Error boundary for route errors
const RouteErrorBoundary = () => {
  const error = useRouteError();
  
  // Log clinical-critical errors
  useEffect(() => {
    logClinicalError('ROUTE_ERROR', error);
  }, [error]);
  
  return (
    <ClinicalErrorPage
      title="Navigation Error"
      message="An error occurred while loading this clinical module."
      error={error}
      action={{ label: 'Return to Dashboard', path: '/' }}
    />
  );
};

// Loading fallback for lazy-loaded routes
const PageLoader = () => (
  <div className="page-loader">
    <ClinicalSpinner size="lg" label="Loading clinical module..." />
  </div>
);

const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    ),
  },
  
  // Protected clinical routes
  {
    path: '/',
    element: (
      <RequireAuth>
        <ClinicalLayout />
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoader />}>
            <Dashboard />
          </Suspense>
        ),
      },
      {
        path: 'patients',
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader />}>
                <PatientList />
              </Suspense>
            ),
          },
          {
            path: ':patientId',
            element: (
              <Suspense fallback={<PageLoader />}>
                <PatientDetail />
              </Suspense>
            ),
            // Load patient data before rendering
            loader: async ({ params }) => {
              const patient = await fetchPatient(params.patientId);
              return { patient };
            },
          },
        ],
      },
      {
        path: 'clinical',
        children: [
          {
            path: 'orders',
            element: (
              <RequireRole allowedRoles={['physician', 'nurse_practitioner']}>
                <Suspense fallback={<PageLoader />}>
                  <OrderEntry />
                </Suspense>
              </RequireRole>
            ),
          },
          {
            path: 'vitals',
            element: (
              <RequireRole allowedRoles={['nurse', 'medical_assistant']}>
                <Suspense fallback={<PageLoader />}>
                  <VitalsEntry />
                </Suspense>
              </RequireRole>
            ),
          },
        ],
      },
      {
        path: 'lab',
        children: [
          {
            path: 'results',
            element: (
              <Suspense fallback={<PageLoader />}>
                <LabResults />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: 'schedule',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Schedule />
          </Suspense>
        ),
      },
      {
        path: 'analytics',
        element: (
          <RequireRole allowedRoles={['physician', 'admin', 'quality_officer']}>
            <Suspense fallback={<PageLoader />}>
              <Analytics />
            </Suspense>
          </RequireRole>
        ),
      },
      {
        path: 'admin',
        element: (
          <RequireRole allowedRoles={['admin']}>
            <Outlet />
          </RequireRole>
        ),
        children: [
          {
            path: 'users',
            element: (
              <Suspense fallback={<PageLoader />}>
                <UserManagement />
              </Suspense>
            ),
          },
          {
            path: 'audit',
            element: (
              <Suspense fallback={<PageLoader />}>
                <AuditLogs />
              </Suspense>
            ),
          },
          {
            path: 'settings',
            element: (
              <Suspense fallback={<PageLoader />}>
                <Settings />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);

export const ClinicalRouter = () => <RouterProvider router={router} />;
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Accessibility** | 7/10 | Focus management requires manual implementation |
| **Route Guards** | 9/10 | Excellent auth and role-based route protection |
| **Data Loading** | 9/10 | Route-level data loading with error boundaries |
| **Code Splitting** | 9/10 | Automatic lazy loading per clinical module |
| **Deep Linking** | 9/10 | Direct links to patient records, encounters, lab results |
| **Error Handling** | 8/10 | Route-level error boundaries for clinical-critical errors |

> **Recommendation:** react-router-dom is the **required routing foundation** for any Clinical OS. Its nested routing, data loading, and error boundary patterns are essential for clinical applications. Always implement focus management on route changes for screen reader users.

---

### 3.3 @reach/router (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/reach/router](https://github.com/reach/router) (archived, merged into React Router) |
| **License** | MIT License |
| **GitHub Stars** | 6,800+ |
| **Language** | JavaScript |
| **Maintainer** | Ryan Florence (merged into React Router v6.4+) |
| **Status** | **Deprecated** -- functionality merged into React Router v6.4+ |

#### Overview

@reach/router was created by Ryan Florence with a primary focus on **accessibility**. It automatically managed focus on route changes, announced navigation to screen readers, and provided a smaller API surface than React Router. In 2022-2023, its accessibility features and routing innovations were merged into React Router v6.4+, and the standalone project was deprecated.

#### Why It Matters for Clinical OS

Despite being deprecated as a standalone project, @reach/router's accessibility innovations are now part of React Router and represent the gold standard for accessible routing:

1. **Focus Management:** Automatically restores focus on navigation
2. **Screen Reader Announcements:** Announces route changes via ARIA live regions
3. **Relative Links:** Simplified relative navigation for nested routes
4. **Ranked Route Matching:** Intelligent route matching with parameter support

#### Accessibility Patterns from @reach/router (Now in React Router)

```tsx
// Accessible route announcements for clinical OS
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// ARIA live region for route change announcements
const RouteAnnouncer = () => {
  const location = useLocation();
  const announcerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get the page title or generate from path
    const pageTitle = document.title || getPageTitleFromPath(location.pathname);
    
    // Announce route change to screen readers
    if (announcerRef.current) {
      announcerRef.current.textContent = `Navigated to ${pageTitle}`;
    }
  }, [location]);

  return (
    <div
      ref={announcerRef}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    />
  );
};

// Focus management on route change
const useFocusRoute = () => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Move focus to main content area on route change
    if (mainRef.current) {
      mainRef.current.focus();
      mainRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location]);

  return mainRef;
};

// Clinical layout with accessible routing
const AccessibleClinicalLayout = () => {
  const mainRef = useFocusRoute();

  return (
    <div className="clinical-app">
      <RouteAnnouncer />
      <ClinicalHeader />
      <ClinicalSidebar />
      <main
        ref={mainRef}
        tabIndex={-1}
        className="clinical-main"
        role="main"
        aria-label="Clinical content"
      >
        <Outlet />
      </main>
      <ClinicalNotificationCenter />
    </div>
  );
};

// Helper to generate page titles from clinical routes
const getPageTitleFromPath = (pathname: string): string => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'Clinical Dashboard';
  
  const entity = segments[0];
  const id = segments[1];
  
  const entityLabels: Record<string, string> = {
    patients: 'Patient',
    encounters: 'Encounter',
    clinical: 'Clinical',
    lab: 'Laboratory',
    schedule: 'Schedule',
    analytics: 'Analytics',
    admin: 'Administration',
  };
  
  const label = entityLabels[entity] || entity;
  return id ? `${label} Details` : `${label} List`;
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Accessibility** | 9/10 | Focus management and screen reader announcements built-in |
| **Integration** | N/A | Use React Router v6.4+ which includes these features |
| **Clinical Safety** | 9/10 | Route change announcements critical for screen reader users |

> **Recommendation:** Do not use @reach/router directly (deprecated). Instead, use **React Router v6.4+** which incorporates all of @reach/router's accessibility innovations. Implement `RouteAnnouncer` and `useFocusRoute` hooks for clinical-grade accessible navigation.

---

### 3.4 wouter (ISC)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/molefrog/wouter](https://github.com/molefrog/wouter) |
| **License** | ISC License |
| **GitHub Stars** | 6,000+ |
| **Language** | JavaScript (TypeScript definitions) |
| **Maintainer** | Alexey Taktarov (molefrog) + community |
| **Bundle Size** | 2.1 KB gzipped (vs. 18.7 KB for React Router) |

#### Overview

wouter is a tiny, minimalist-friendly routing library for React and Preact. At only 2.1 KB gzipped, it provides a familiar API (Route, Link, Switch, Redirect) with a hooks-based approach for granular control. It has no top-level `<Router>` component requirement, supports both React and Preact, and is designed for performance.

#### Key Features

- **Minimal Size:** 2.1 KB gzipped -- ideal for performance-critical clinical apps
- **Hooks API:** `useRoute`, `useLocation`, `useParams`, `useSearch`, `useRouter`
- **Familiar API:** Route, Link, Switch, Redirect components similar to React Router
- **Optional Router:** No top-level Router component required
- **Custom Location Hooks:** Hash routing, memory routing, custom implementations
- **Nested Routes:** `nest` prop for nested routing contexts
- **SSR Support:** Server-side rendering with `ssrPath` and `ssrSearch`
- **TypeScript:** Route parameter inference (TypeScript 4.1+)
- **View Transitions:** `aroundNav` hook for View Transitions API integration

#### Clinical OS Use Case

wouter is ideal for **embedded clinical widgets**, **micro-frontends**, and **performance-critical clinical interfaces** where bundle size matters:

```tsx
// Lightweight clinical widget with wouter
import { Route, Link, useRoute, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';

// Mini patient summary widget that embeds in EHR
const PatientSummaryWidget = ({ patientId }: { patientId: string }) => {
  return (
    <Router hook={useHashLocation} base={`/patient/${patientId}`}>
      <div className="patient-widget">
        <nav className="widget-nav" aria-label="Patient summary sections">
          <Link href="/overview">Overview</Link>
          <Link href="/vitals">Vitals</Link>
          <Link href="/medications">Medications</Link>
          <Link href="/allergies">Allergies</Link>
        </nav>
        
        <Switch>
          <Route path="/overview" component={PatientOverview} />
          <Route path="/vitals" component={VitalsSummary} />
          <Route path="/medications" component={MedicationList} />
          <Route path="/allergies" component={AllergyList} />
          <Route path="/">
            <PatientOverview />
          </Route>
        </Switch>
      </div>
    </Router>
  );
};

// Custom hook for active link styling
const useActiveLink = (path: string) => {
  const [isActive] = useRoute(path);
  return isActive;
};

// Active link component
const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const isActive = useActiveLink(href);
  return (
    <Link
      href={href}
      className={isActive ? 'nav-link active' : 'nav-link'}
      aria-current={isActive ? 'page' : undefined}
    >
      {children}
    </Link>
  );
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Bundle Size** | 10/10 | Smallest React router available |
| **Accessibility** | 5/10 | Requires manual focus management |
| **Feature Set** | 6/10 | Lacks data loading, nested layouts of React Router |
| **Clinical Workflow** | 6/10 | Good for widgets; limited for full clinical application |
| **Performance** | 10/10 | Minimal overhead, fast route matching |

> **Recommendation:** wouter is recommended for **clinical micro-frontends, embedded widgets, and bundle-size-constrained applications**. For full Clinical OS applications, use React Router v6.4+ for its data loading, error boundaries, and accessibility features.

---

## Section 3 Summary: Navigation Component Comparison

| Feature | react-pro-sidebar | react-router-dom | @reach/router | wouter |
|---------|-------------------|-------------------|---------------|--------|
| **License** | MIT | MIT | MIT | ISC |
| **Stars** | 3,900+ | 54,000+ | 6,800+ (deprecated) | 6,000+ |
| **Bundle Size** | ~15 KB | ~18.7 KB | ~7 KB | ~2.1 KB |
| **Primary Role** | Sidebar UI | Router | Accessible Router | Lightweight Router |
| **Accessibility** | Moderate | Good | Excellent (now in RR) | Basic |
| **TypeScript** | Yes | Yes | No | Yes |
| **Clinical OS Fit** | Sidebar Component | Required Foundation | Use React Router | Widgets Only |

### Recommended Navigation Stack

```
react-router-dom (v6.4+)    -- Primary routing foundation
  + react-pro-sidebar       -- Sidebar UI component
  + @radix-ui/collapsible   -- Accessible collapsible sections
  + react-aria (useFocusRing, useKeyboard) -- Keyboard navigation
  + Custom RouteAnnouncer   -- Screen reader announcements
  + Custom useFocusRoute    -- Focus management on navigation
```

---

## Section 4: Healthcare UI Components

> Healthcare UI components must handle complex clinical data (FHIR resources), medical terminology, patient safety-critical information, and strict accessibility requirements. This section covers FHIR React component libraries, medical icon sets, and clinical charting libraries.

---

### 4.1 FHIR React Components

#### Overview

FHIR (Fast Healthcare Interoperability Resources) is the global standard for health data exchange. FHIR React component libraries provide pre-built React components that render FHIR resources as human-readable, interactive clinical interfaces. These components dramatically accelerate Clinical OS development by handling the complex mapping from FHIR JSON to clinical UI.

---

#### 4.1.1 bonFHIR (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/bonfhir/bonfhir](https://github.com/bonfhir/bonfhir) |
| **License** | MIT License |
| **GitHub Stars** | 250+ |
| **Language** | TypeScript, React |
| **FHIR Versions** | R4, R4B |

##### Overview

bonFHIR is a modern, TypeScript-first collection of FHIR utilities and React components. It provides typed FHIR resource handling, React hooks for FHIR operations, and pre-built UI components for displaying FHIR data. The project includes starter templates for Vite, Next.js, and AWS Lambda applications.

##### Key Features

- **TypeScript-First:** Full FHIR R4/R4B type definitions
- **React Hooks:** `useFhirSearch`, `useFhirRead`, `useFhirExecute` for FHIR operations
- **UI Components:** `FhirTable`, `FhirValue`, `FhirQueryLoader` for rendering FHIR data
- **Mantine Integration:** Built on Mantine UI component library
- **Starter Templates:** Vite SPA, Next.js, AWS Lambda, monorepo templates
- **FHIR Client:** Typed FHIR client with search builder

##### Example: bonFHIR Patient Table

```tsx
import { useFhirSearch } from '@bonfhir/query/r4b';
import { FhirTable, FhirValue } from '@bonfhir/react/r4b';
import { Paper } from '@mantine/core';

const PatientDirectory = () => {
  const patientQuery = useFhirSearch('Patient', (search) =>
    search
      .name('Smith')
      ._count(20)
      ._sort('name')
  );

  return (
    <Paper p="md">
      <FhirTable
        {...patientQuery}
        columns={[
          {
            key: 'name',
            title: 'Patient Name',
            sortable: true,
            render(patient) {
              return <FhirValue type="HumanName" value={patient.name} />;
            },
          },
          {
            key: 'birthDate',
            title: 'Date of Birth',
            sortable: true,
            render(patient) {
              return <FhirValue type="date" value={patient.birthDate} />;
            },
          },
          {
            key: 'gender',
            title: 'Gender',
            render(patient) {
              return <FhirValue type="code" value={patient.gender} />;
            },
          },
          {
            key: 'mrn',
            title: 'MRN',
            render(patient) {
              const mrn = patient.identifier?.find(
                (id) => id.type?.coding?.[0].code === 'MR'
              );
              return <span>{mrn?.value || 'N/A'}</span>;
            },
          },
        ]}
      />
    </Paper>
  );
};
```

#### 4.1.2 fhir-ui (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/healthintellect/fhir-ui](https://github.com/healthintellect/fhir-ui) |
| **License** | MIT License |
| **GitHub Stars** | 80+ |
| **Language** | JavaScript, React |
| **UI Framework** | Material-UI (MUI v4) |

##### Overview

fhir-ui provides React components for displaying HL7 FHIR data using Material-UI. It includes PatientCard, PatientTable, PatientDetail, ObservationTable, ObservationDetail, ConditionTable, AllergyTable, and MedicationTable components.

##### Components

| Component | FHIR Resource | Clinical Use |
|-----------|--------------|--------------|
| `PatientCard` | Patient | Patient summary card with demographics |
| `PatientTable` | Patient | Sortable patient directory |
| `PatientDetail` | Patient | Full patient record view |
| `ObservationTable` | Observation | Lab results, vital signs listing |
| `ObservationDetail` | Observation | Detailed result view with reference ranges |
| `ConditionTable` | Condition | Problem list, diagnosis history |
| `AllergyTable` | AllergyIntolerance | Allergy and intolerance list |
| `MedicationTable` | MedicationRequest | Active medication list |

#### 4.1.3 fhir-starter (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/clinical-meteor/fhir-starter](https://github.com/clinical-meteor/fhir-starter) |
| **License** | MIT License |
| **GitHub Stars** | 30+ |
| **Language** | JavaScript, React |
| **UI Framework** | Material-UI |

##### Overview

fhir-starter (formerly Material-FHIR UI) is a set of React components implementing HL7 FHIR Resources with Google's Material Design specification. It tracks normative-level FHIR resources (Patient and Observation as of R4) and is designed as an extension to the Material UI component library.

#### 4.1.4 LTHT React (Archived)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/ltht-epr/ltht-react](https://github.com/ltht-epr/ltht-react) |
| **Status** | Archived |
| **License** | MIT License |
| **Language** | TypeScript, React |

##### Overview

Leeds Teaching Hospitals NHS Trust (LTHT) React components provide reusable medical React components using CSS-in-JS (Emotion). Built on atomic design principles, the library includes clinical components for diagnosis summaries, flag summaries, questionnaires, and more. The project is archived but provides valuable reference implementations for NHS-grade clinical components.

#### 4.1.5 SMART on FHIR React Template

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/standardhealth/smart-react-app-template](https://github.com/standardhealth/smart-react-app-template) |
| **License** | Apache-2.0 |
| **GitHub Stars** | 150+ |
| **Framework** | Create React App + fhirclient |

##### Overview

This template provides a minimal SMART on FHIR React application with the `fhirclient` library for SMART authorization and EHR interactions. It is the recommended starting point for Clinical OS applications that launch from within existing EHR systems (Epic, Cerner) via SMART on FHIR.

```typescript
// SMART on FHIR launch sequence
import FHIR from 'fhirclient';

const launchSMARTApp = async () => {
  const client = await FHIR.oauth2.ready();
  
  // Get the selected patient from the EHR context
  const patient = await client.request(`Patient/${client.patient.id}`);
  
  // Get patient's conditions
  const conditions = await client.request(
    `Condition?patient=${client.patient.id}`
  );
  
  // Get active medications
  const medications = await client.request(
    `MedicationRequest?patient=${client.patient.id}&status=active`
  );
  
  return { patient, conditions, medications };
};
```

#### Clinical Suitability: FHIR Components

| Library | FHIR Support | UI Framework | Status | Clinical OS Fit |
|---------|-------------|--------------|--------|-----------------|
| **bonFHIR** | R4/R4B | Mantine | Active | Excellent |
| **fhir-ui** | R4 | Material-UI v4 | Moderate | Good |
| **fhir-starter** | R4 (normative) | Material-UI | Low activity | Reference |
| **LTHT React** | Custom | Emotion | Archived | Reference |
| **SMART Template** | R4 | CRA | Reference | Starting Point |

> **Recommendation:** Use **bonFHIR** as the primary FHIR React component library for new Clinical OS builds. It is the most actively maintained, TypeScript-first, and provides modern React patterns. Use the **SMART on FHIR React Template** for EHR-embedded applications.

---

### 4.2 Medical Icon Sets

#### 4.2.1 Health Icons (MIT/CC0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/resolvetosavelives/healthicons](https://github.com/resolvetosavelives/healthicons) |
| **License** | MIT (code) / CC0 (icons) -- public domain |
| **GitHub Stars** | 1,200+ |
| **Icon Count** | 1,900+ icons in outline and filled variants |
| **Formats** | SVG, PNG (48px, 96px) |
| **Maintainer** | Resolve to Save Lives (public health non-profit) |

##### Overview

Health Icons is a volunteer effort to create a "global good" for health projects worldwide. Hosted by the public health not-for-profit Resolve to Save Lives, the collection includes over 1,900 icons covering blood types, body systems, conditions, contraceptives, devices, diagnostics, emotions, exercise, medications, nutrition, people, places, PPE, specialties, and more.

##### Icon Categories for Clinical OS

| Category | Icons | Clinical OS Application |
|----------|-------|------------------------|
| **Blood** | 15+ | Blood bank, transfusion, type matching |
| **Body** | 50+ | Anatomy references, body system navigation |
| **Conditions** | 100+ | Problem list, diagnosis icons |
| **Devices** | 80+ | Medical device tracking, equipment management |
| **Diagnostics** | 120+ | Lab ordering, imaging, test results |
| **Medications** | 150+ | Pharmacy, medication administration |
| **People** | 200+ | Patient types, providers, caregivers |
| **Places** | 50+ | Facility navigation, room types |
| **PPE** | 30+ | Infection control, safety protocols |
| **Specialties** | 80+ | Department navigation, specialty referrals |

##### React Integration

```tsx
// Using Health Icons in React
import 'healthicons/css/healthicons.css';

// Filled icon
const BloodTypeIcon = () => (
  <i className="healthicons-f-blood-a-p" aria-hidden="true" />
);

// Outline icon with clinical styling
const HeartIcon = ({ alert }: { alert?: boolean }) => (
  <i 
    className="healthicons-o-cardiogram" 
    style={{ 
      color: alert ? '#DC2626' : '#6B7280',
      fontSize: '24px',
    }}
    aria-label="Cardiovascular"
  />
);

// Health Icons React wrapper
import { 
  HealthiconsFHeartCardiogram,
  HealthiconsFBloodBag,
  HealthiconsFMedicines,
  HealthiconsFStethoscope,
} from 'healthicons-react';

const ClinicalNavIcons = {
  dashboard: HealthiconsFHeartCardiogram,
  patients: HealthiconsFBloodBag,
  medications: HealthiconsFMedicines,
  clinical: HealthiconsFStethoscope,
};
```

#### 4.2.2 Font Awesome Medical Icons

| Attribute | Detail |
|-----------|--------|
| **License** | Font Awesome Free (CC BY 4.0) / Pro (commercial) |
| **Icon Count** | 100+ medical/health icons in free set |
| **Formats** | SVG, Web Font, React Components |

##### Overview

Font Awesome is the most widely used icon library on the web. The free set includes over 100 medical and health-related icons, with significantly more in the Pro version. Font Awesome React provides tree-shakeable React components for each icon.

```tsx
// Font Awesome medical icons in React
import { 
  faHeartPulse,
  faStethoscope,
  faSyringe,
  faPills,
  faDna,
  faVial,
  faMicroscope,
  faRadiation,
  faBrain,
  faEye,
  faTooth,
  faBone,
  faWheelchair,
  faHospital,
  faUserNurse,
  faUserDoctor,
  faAmbulance,
  faKitMedical,
  faPrescription,
  faCapsules,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const ClinicalIcon = ({ type, size = 'lg' }: { type: string; size?: string }) => {
  const iconMap: Record<string, any> = {
    cardiovascular: faHeartPulse,
    pulmonary: faStethoscope,
    immunization: faSyringe,
    pharmacy: faPills,
    genetics: faDna,
    laboratory: faVial,
    pathology: faMicroscope,
    radiology: faRadiation,
    neurology: faBrain,
    ophthalmology: faEye,
    dental: faTooth,
    orthopedic: faBone,
    accessibility: faWheelchair,
    facility: faHospital,
    nursing: faUserNurse,
    physician: faUserDoctor,
    emergency: faAmbulance,
    firstAid: faKitMedical,
    prescription: faPrescription,
    medication: faCapsules,
  };

  return <FontAwesomeIcon icon={iconMap[type] || faHospital} size={size} />;
};
```

#### 4.2.3 Tabler Icons

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/tabler/tabler-icons](https://github.com/tabler/tabler-icons) |
| **License** | MIT License |
| **GitHub Stars** | 9,100+ |
| **Icon Count** | 6,074+ icons |

##### Overview

Tabler Icons is a set of over 6,000 free SVG icons designed specifically for web applications. The icons are highly consistent in style, optimized for small sizes, and available as React components. The set includes many healthcare-relevant icons.

```tsx
// Tabler Icons in React
import { 
  IconHeartPulse,
  IconStethoscope,
  IconMedicineSyrup,
  IconMicroscope,
  IconBrain,
  IconEye,
  IconActivity,
  IconClipboardList,
  IconCalendar,
  IconUsers,
  IconFileReport,
  IconSettings,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconChevronRight,
  IconMenu2,
  IconSearch,
  IconBell,
  IconLogout,
} from '@tabler/icons-react';
```

#### 4.2.4 webfont-medical-icons

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/samcome/webfont-medical-icons](https://github.com/samcome/webfont-medical-icons) |
| **License** | Free (terms from Hablamos Juntos) |
| **GitHub Stars** | 300+ |
| **Icon Count** | 72 medical-specialized icons (x2 variants) |

##### Overview

A specialized set of 72 medical icons designed for clinical and healthcare applications. The icons were originally designed by Hablamos Juntos and include clinical specialties, medical equipment, and healthcare symbols.

#### Clinical Suitability: Icon Libraries

| Library | Count | License | React Support | Clinical OS Fit |
|---------|-------|---------|---------------|-----------------|
| **Health Icons** | 1,900+ | CC0 | Yes (react wrapper) | Excellent |
| **Font Awesome** | 100+ medical | CC BY 4.0 | Yes (@fortawesome/react) | Excellent |
| **Tabler Icons** | 6,074 total | MIT | Yes (@tabler/icons-react) | Very Good |
| **webfont-medical** | 72 | Free | Web font | Good |

> **Recommendation:** Use **Health Icons** as the primary medical icon set (public domain, healthcare-specific). Supplement with **Font Awesome** for general UI icons and **Tabler Icons** for application UI elements.

---

### 4.3 Chart.js (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/chartjs/Chart.js](https://github.com/chartjs/Chart.js) |
| **License** | MIT License |
| **GitHub Stars** | 64,000+ |
| **Weekly Downloads** | 2,400,000+ (npm) |
| **Language** | JavaScript |
| **Maintainer** | Chart.js Community |
| **First Release** | 2013 (v1.0); v4 released 2022 |

#### Overview

Chart.js is the most popular open-source JavaScript charting library, with over 64,000 GitHub stars and 2.4 million weekly npm downloads. It provides eight built-in chart types, extensive customization options, plugin architecture, and high-performance canvas rendering. Chart.js is widely used in clinical dashboards for vital sign trends, lab result visualization, and population health analytics.

#### Key Features

- **8 Chart Types:** Bar, line, area, pie/doughnut, bubble, radar, polar, scatter
- **Canvas Rendering:** High-performance HTML5 canvas (not SVG)
- **Animations:** Built-in animations with customizable easing and duration
- **Plugin System:** Annotation, zoom, drag-and-drop, data labels plugins
- **Mixed Charts:** Combine multiple chart types on single canvas
- **Responsive:** Automatic resizing with responsive breakpoints
- **TypeScript:** Built-in TypeScript type definitions
- **Framework Wrappers:** React, Vue, Svelte, Angular wrappers available
- **Tree-Shakeable:** Import only needed chart types

#### Clinical Chart Types

| Chart Type | Clinical Application | Example |
|------------|---------------------|---------|
| **Line Chart** | Vital sign trends over time | Blood pressure, heart rate, temperature trends |
| **Bar Chart** | Comparative clinical metrics | Lab result comparisons, patient volume by department |
| **Area Chart** | Cumulative clinical data | Patient acuity scores, infection rate trends |
| **Doughnut Chart** | Proportional data | Patient mix by payer, diagnosis distribution |
| **Bubble Chart** | Multi-dimensional data | Risk stratification (age, severity, cost) |
| **Radar Chart** | Multi-metric assessment | Functional status assessment, sepsis criteria |

#### React Integration

```tsx
// Clinical vital signs chart with Chart.js and react-chartjs-2
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { useMemo } from 'react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface VitalSignReading {
  timestamp: Date;
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  temperature?: number;
  spo2?: number;
  respiratoryRate?: number;
}

const VitalSignsChart = ({ 
  readings,
  selectedMetrics = ['systolic', 'diastolic', 'heartRate'],
}: { 
  readings: VitalSignReading[];
  selectedMetrics?: string[];
}) => {
  const chartData = useMemo(() => {
    const sortedReadings = [...readings].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const metricConfig: Record<string, { label: string; color: string; unit: string }> = {
      systolic: { label: 'Systolic BP', color: '#DC2626', unit: 'mmHg' },
      diastolic: { label: 'Diastolic BP', color: '#2563EB', unit: 'mmHg' },
      heartRate: { label: 'Heart Rate', color: '#059669', unit: 'bpm' },
      temperature: { label: 'Temperature', color: '#D97706', unit: '\u00B0C' },
      spo2: { label: 'SpO2', color: '#7C3AED', unit: '%' },
      respiratoryRate: { label: 'Respiratory Rate', color: '#0891B2', unit: '/min' },
    };

    return {
      datasets: selectedMetrics.map((metric) => ({
        label: metricConfig[metric]?.label || metric,
        data: sortedReadings
          .filter((r) => r[metric as keyof VitalSignReading] != null)
          .map((r) => ({
            x: r.timestamp,
            y: r[metric as keyof VitalSignReading] as number,
          })),
        borderColor: metricConfig[metric]?.color || '#6B7280',
        backgroundColor: metricConfig[metric]?.color + '20', // 20 hex = ~12% opacity
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
      })),
    };
  }, [readings, selectedMetrics]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          title: (items: any) => {
            return new Date(items[0].parsed.x).toLocaleString();
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'MMM d, HH:mm',
          },
        },
        title: {
          display: true,
          text: 'Time',
        },
        grid: {
          display: false,
        },
      },
      y: {
        title: {
          display: true,
          text: 'Value',
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
    },
  };

  return (
    <div className="vital-signs-chart" role="img" aria-label="Vital signs trend chart">
      <Line data={chartData} options={options} height={300} />
    </div>
  );
};

export default VitalSignsChart;
```

#### Clinical Reference Ranges (Visual Indicators)

```tsx
// Chart.js annotation plugin for clinical reference ranges
import annotationPlugin from 'chartjs-plugin-annotation';

ChartJS.register(annotationPlugin);

// Add reference range annotations for blood pressure
const bpAnnotations = {
  annotations: {
    hypotensionSystolic: {
      type: 'box' as const,
      yMin: 0,
      yMax: 90,
      backgroundColor: 'rgba(220, 38, 38, 0.08)',
      borderWidth: 0,
      label: {
        content: 'Hypotension',
        position: 'start' as const,
        color: '#DC2626',
        font: { size: 10 },
      },
    },
    normalSystolic: {
      type: 'box' as const,
      yMin: 90,
      yMax: 120,
      backgroundColor: 'rgba(5, 150, 105, 0.05)',
      borderWidth: 0,
      label: {
        content: 'Normal',
        position: 'start' as const,
        color: '#059669',
        font: { size: 10 },
      },
    },
    elevatedSystolic: {
      type: 'box' as const,
      yMin: 120,
      yMax: 140,
      backgroundColor: 'rgba(245, 158, 11, 0.05)',
      borderWidth: 0,
      label: {
        content: 'Elevated',
        position: 'start' as const,
        color: '#F59E0B',
        font: { size: 10 },
      },
    },
    hypertensionSystolic: {
      type: 'box' as const,
      yMin: 140,
      yMax: 300,
      backgroundColor: 'rgba(220, 38, 38, 0.08)',
      borderWidth: 0,
      label: {
        content: 'Hypertension',
        position: 'start' as const,
        color: '#DC2626',
        font: { size: 10 },
      },
    },
  },
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Chart Types** | 9/10 | All essential clinical chart types |
| **Performance** | 9/10 | Canvas rendering handles large datasets |
| **Accessibility** | 5/10 | Canvas charts require ARIA alternatives |
| **Reference Ranges** | 8/10 | Annotation plugin for clinical ranges |
| **Time Series** | 9/10 | Time scale for vital signs, lab trends |
| **Customization** | 9/10 | Extensive options, plugin architecture |

> **Recommendation:** Chart.js is the **recommended charting library** for clinical dashboards. Its performance, time-series support, and annotation capabilities make it ideal for vital sign trends, lab results, and population health visualizations. Always provide ARIA text alternatives for canvas-rendered charts.

---

### 4.4 D3.js (BSD/ISC)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/d3/d3](https://github.com/d3/d3) |
| **License** | ISC License (permissive, BSD-style) |
| **GitHub Stars** | 108,000+ |
| **Language** | JavaScript |
| **Maintainer** | Mike Bostock + D3 community |
| **First Release** | 2011 |

#### Overview

D3.js (Data-Driven Documents) is the most powerful and flexible data visualization library for the web. With over 108,000 GitHub stars, it is the second most starred data visualization library after only the Linux kernel in the data visualization category. D3 provides low-level primitives for manipulating documents based on data, enabling the creation of virtually any type of visualization imaginable. While Chart.js covers standard clinical charts, D3.js enables custom clinical visualizations that cannot be achieved with higher-level libraries.

#### Key Features

- **Low-Level Primitives:** Selections, data binding, transitions, scales, axes, shapes
- **SVG, Canvas, HTML:** Multiple rendering backends
- **Modular Architecture:** 30+ separate D3 modules for specific visualization needs
- **Data Binding:** Join data to DOM with enter/update/exit pattern
- **Transitions:** Smooth animations with customizable easing
- **Geographic:** d3-geo for mapping, projections, and spatial visualizations
- **Hierarchical:** d3-hierarchy for tree diagrams, treemaps, pack layouts
- **Force Simulation:** d3-force for force-directed graphs
- **Time Handling:** d3-time for complex time-based calculations
- **Color Management:** d3-color, d3-scale-chromatic for clinical color schemes

#### Clinical Applications

| Visualization | Clinical Use | D3 Module |
|---------------|-------------|-----------|
| **Vital Signs Sparkline** | Inline trend in patient lists | d3-shape, d3-scale |
| **ECG Waveform** | Real-time cardiac monitoring | d3-shape, d3-transition |
| **Anatomical Diagram** | Interactive body map for symptom documentation | d3-geo, d3-selection |
| **Care Pathway Flow** | Clinical workflow visualization | d3-hierarchy, d3-sankey |
| **Genomic Visualization** | Gene sequence, variant display | d3-scale, d3-axis |
| **Epidemic Curve** | Outbreak investigation | d3-shape, d3-time |
| **Patient Relationship Graph** | Social determinants, care team network | d3-force |
| **Calendar Heatmap** | Appointment density, bed utilization | d3-scale, d3-time |
| **Gantt Chart** | Surgery scheduling, OR utilization | d3-scale, d3-axis, d3-shape |

#### Custom Clinical Visualization Example

```tsx
// Custom patient acuity visualization with D3
import * as d3 from 'd3';
import { useRef, useEffect } from 'react';

interface PatientAcuityNode {
  id: string;
  name: string;
  acuityScore: number; // 1-5, 5 being highest acuity
  department: string;
  age: number;
  lengthOfStay: number;
}

const PatientAcuityVisualization = ({ 
  patients,
  width = 800,
  height = 400,
}: { 
  patients: PatientAcuityNode[];
  width?: number;
  height?: number;
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || patients.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const margin = { top: 30, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleBand()
      .domain(patients.map((p) => p.name))
      .range([0, innerWidth])
      .padding(0.3);

    const yScale = d3
      .scaleLinear()
      .domain([0, 5])
      .range([innerHeight, 0]);

    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(['ED', 'ICU', 'General', 'Surgery', 'OB'])
      .range(['#DC2626', '#7C3AED', '#2563EB', '#059669', '#D97706']);

    // Reference lines for acuity levels
    const acuityLevels = [
      { level: 1, label: 'Minimal', color: '#10B981' },
      { level: 2, label: 'Low', color: '#34D399' },
      { level: 3, label: 'Moderate', color: '#F59E0B' },
      { level: 4, label: 'High', color: '#F97316' },
      { level: 5, label: 'Critical', color: '#DC2626' },
    ];

    acuityLevels.forEach((al) => {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(al.level))
        .attr('y2', yScale(al.level))
        .attr('stroke', al.color)
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.5);
    });

    // Bars
    g.selectAll('.acuity-bar')
      .data(patients)
      .join('rect')
      .attr('class', 'acuity-bar')
      .attr('x', (d) => xScale(d.name) || 0)
      .attr('y', (d) => yScale(d.acuityScore))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => innerHeight - yScale(d.acuityScore))
      .attr('fill', (d) => colorScale(d.department))
      .attr('rx', 4)
      .attr('opacity', 0.8)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1).attr('stroke', '#1F2937').attr('stroke-width', 2);
        
        // Tooltip
        const tooltip = g
          .append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${(xScale(d.name) || 0) + xScale.bandwidth() / 2},${yScale(d.acuityScore) - 10})`);
        
        tooltip
          .append('text')
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('fill', '#374151')
          .text(`${d.name}: Acuity ${d.acuityScore}/5`);
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.8).attr('stroke', 'none');
        g.selectAll('.tooltip').remove();
      });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .attr('font-size', '11px');

    g.append('g')
      .call(
        d3.axisLeft(yScale).ticks(5).tickFormat((d) => `Level ${d}`)
      )
      .attr('font-size', '11px');

    // Labels
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - innerHeight / 2)
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#6B7280')
      .text('Patient Acuity Score');

    g.append('text')
      .attr('transform', `translate(${innerWidth / 2}, ${innerHeight + margin.bottom - 5})`)
      .style('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#6B7280')
      .text('Patient');

    // Legend
    const legend = g
      .append('g')
      .attr('transform', `translate(${innerWidth - 100}, 0)`);

    colorScale.domain().forEach((dept, i) => {
      const legendRow = legend.append('g').attr('transform', `translate(0, ${i * 18})`);
      
      legendRow
        .append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', colorScale(dept))
        .attr('rx', 2);
      
      legendRow
        .append('text')
        .attr('x', 18)
        .attr('y', 10)
        .attr('font-size', '10px')
        .attr('fill', '#6B7280')
        .text(dept);
    });

  }, [patients, width, height]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      role="img"
      aria-label="Patient acuity score visualization"
    >
      <title>Patient Acuity Scores by Department</title>
      <desc>
        Bar chart showing patient acuity scores ranging from 1 (minimal) to 5 (critical),
        color-coded by department.
      </desc>
    </svg>
  );
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Flexibility** | 10/10 | Unlimited visualization possibilities |
| **Performance** | 8/10 | SVG for precision; Canvas for large datasets |
| **Accessibility** | 6/10 | SVG is more accessible than Canvas; requires ARIA |
| **Learning Curve** | 4/10 | Steep learning curve; requires significant D3 expertise |
| **Clinical Charts** | 10/10 | Custom clinical visualizations not possible with other libraries |
| **Time to Implement** | 4/10 | Significantly longer than Chart.js for standard charts |

> **Recommendation:** Use D3.js for **custom clinical visualizations** that cannot be achieved with Chart.js: ECG waveforms, anatomical diagrams, care pathway flows, genomic visualizations, and patient relationship graphs. For standard charts (line, bar, pie), use Chart.js for faster development. Many clinical applications benefit from using both libraries.

---

## Section 4 Summary: Healthcare UI Components

| Component Type | Recommended Library | FHIR Support | Accessibility | Clinical Fit |
|----------------|-------------------|--------------|---------------|--------------|
| **FHIR Components** | bonFHIR | R4/R4B | Good | Excellent |
| **Medical Icons** | Health Icons + Font Awesome | N/A | N/A | Excellent |
| **Standard Charts** | Chart.js | Via FHIR data | Requires ARIA alt | Excellent |
| **Custom Visualizations** | D3.js | Via FHIR data | Requires ARIA | Excellent |
| **EHR Embed** | SMART on FHIR Template | R4 | Basic | Starting Point |

---

## Section 5: State Management

> State management in clinical systems is complex and safety-critical. Patient data must be consistent across views, clinical decisions depend on accurate real-time state, and concurrent modifications by multiple providers must be handled safely. The state management solution must support optimistic updates (for responsive UI), rollback capability (for clinical safety), and audit logging (for compliance).

---

### 5.1 Zustand (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/pmndrs/zustand](https://github.com/pmndrs/zustand) |
| **License** | MIT License |
| **GitHub Stars** | 47,000+ |
| **Bundle Size** | 1.1 KB (zustand) / 1.6 KB (with middleware) |
| **Language** | TypeScript |
| **Maintainer** | Poimandres (pmndrs) community |
| **First Release** | 2019 |

#### Overview

Zustand (German for "state") is a small, fast, and scalable state management solution using simplified flux principles. With a hooks-based API, minimal boilerplate, and no requirement for wrapping the app in context providers, Zustand has become one of the most popular state management libraries in the React ecosystem. Its 47,000+ GitHub stars reflect its developer experience excellence.

#### Key Features

- **Minimal Boilerplate:** No actions, reducers, or dispatchers required
- **No Providers:** No context provider wrapping needed
- **TypeScript First:** Excellent type inference with minimal type annotations
- **Middleware:** Redux DevTools, persist, subscribe, immer integration
- **Selectors:** Subscribe to specific state slices for optimal re-renders
- **Async Support:** Built-in async action support
- **Multi-Store:** Create multiple stores for different domains
- **React 18 Concurrent Features:** Compatible with React 18 concurrent rendering
- **Small Bundle:** 1.1 KB gzipped

#### Clinical OS State Store

```tsx
// Clinical OS state management with Zustand
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Types
import { Patient, Encounter, Observation, MedicationRequest } from 'fhir/r4';

// Patient Store -- manages selected patient and related data
interface PatientState {
  selectedPatient: Patient | null;
  patientEncounters: Encounter[];
  patientObservations: Observation[];
  patientMedications: MedicationRequest[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  selectPatient: (patient: Patient) => void;
  clearPatient: () => void;
  setEncounters: (encounters: Encounter[]) => void;
  setObservations: (observations: Observation[]) => void;
  setMedications: (medications: MedicationRequest[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const usePatientStore = create<PatientState>()(
  devtools(
    immer(
      (set) => ({
        selectedPatient: null,
        patientEncounters: [],
        patientObservations: [],
        patientMedications: [],
        isLoading: false,
        error: null,

        selectPatient: (patient) =>
          set((state) => {
            state.selectedPatient = patient;
            state.error = null;
          }, false, 'patient/selectPatient'),

        clearPatient: () =>
          set((state) => {
            state.selectedPatient = null;
            state.patientEncounters = [];
            state.patientObservations = [];
            state.patientMedications = [];
          }, false, 'patient/clearPatient'),

        setEncounters: (encounters) =>
          set((state) => {
            state.patientEncounters = encounters;
          }, false, 'patient/setEncounters'),

        setObservations: (observations) =>
          set((state) => {
            state.patientObservations = observations;
          }, false, 'patient/setObservations'),

        setMedications: (medications) =>
          set((state) => {
            state.patientMedications = medications;
          }, false, 'patient/setMedications'),

        setLoading: (loading) =>
          set((state) => {
            state.isLoading = loading;
          }, false, 'patient/setLoading'),

        setError: (error) =>
          set((state) => {
            state.error = error;
          }, false, 'patient/setError'),
      })
    ),
    { name: 'PatientStore' }
  )
);

// UI Store -- manages sidebar, modals, notifications
interface UIState {
  sidebarCollapsed: boolean;
  activeModal: string | null;
  notifications: ClinicalNotification[];
  theme: 'light' | 'dark';
  
  toggleSidebar: () => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  addNotification: (notification: ClinicalNotification) => void;
  dismissNotification: (id: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

interface ClinicalNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: { label: string; onClick: () => void };
}

const useUIStore = create<UIState>()(
  devtools(
    immer(
      (set) => ({
        sidebarCollapsed: false,
        activeModal: null,
        notifications: [],
        theme: 'light',

        toggleSidebar: () =>
          set((state) => {
            state.sidebarCollapsed = !state.sidebarCollapsed;
          }, false, 'ui/toggleSidebar'),

        openModal: (modalId) =>
          set((state) => {
            state.activeModal = modalId;
          }, false, 'ui/openModal'),

        closeModal: () =>
          set((state) => {
            state.activeModal = null;
          }, false, 'ui/closeModal'),

        addNotification: (notification) =>
          set((state) => {
            state.notifications.unshift(notification);
            // Keep max 50 notifications
            if (state.notifications.length > 50) {
              state.notifications.pop();
            }
          }, false, 'ui/addNotification'),

        dismissNotification: (id) =>
          set((state) => {
            const index = state.notifications.findIndex((n) => n.id === id);
            if (index !== -1) {
              state.notifications.splice(index, 1);
            }
          }, false, 'ui/dismissNotification'),

        setTheme: (theme) =>
          set((state) => {
            state.theme = theme;
          }, false, 'ui/setTheme'),
      })
    ),
    { name: 'UIStore' }
  )
);

// Auth Store -- manages user session and permissions
interface AuthState {
  user: ClinicalUser | null;
  token: string | null;
  isAuthenticated: boolean;
  permissions: string[];
  
  login: (user: ClinicalUser, token: string) => void;
  logout: () => void;
  updatePermissions: (permissions: string[]) => void;
}

interface ClinicalUser {
  id: string;
  name: string;
  email: string;
  role: 'physician' | 'nurse' | 'admin' | 'pharmacist' | 'lab_technician' | 'radiologist';
  department: string;
  facility: string;
}

const useAuthStore = create<AuthState>()(
  persist(
    devtools(
      immer((set) => ({
        user: null,
        token: null,
        isAuthenticated: false,
        permissions: [],

        login: (user, token) =>
          set((state) => {
            state.user = user;
            state.token = token;
            state.isAuthenticated = true;
          }, false, 'auth/login'),

        logout: () =>
          set((state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;
            state.permissions = [];
          }, false, 'auth/logout'),

        updatePermissions: (permissions) =>
          set((state) => {
            state.permissions = permissions;
          }, false, 'auth/updatePermissions'),
      })),
      { name: 'AuthStore' }
    ),
    {
      name: 'clinical-os-auth',
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// Usage in components with selective subscription
const PatientHeader = () => {
  // Only re-render when selectedPatient changes (not encounters, observations, etc.)
  const patient = usePatientStore((state) => state.selectedPatient);
  
  if (!patient) return <div>No patient selected</div>;
  
  return (
    <header className="patient-header">
      <h1>
        {patient.name?.[0]?.given?.join(' ')} {patient.name?.[0]?.family}
      </h1>
      <span className="mrn">MRN: {patient.identifier?.[0]?.value}</span>
      <span className="dob">
        DOB: {patient.birthDate} ({calculateAge(patient.birthDate)}y)
      </span>
    </header>
  );
};
```

#### Clinical Safety Considerations

```tsx
// Clinical-safe state updates with optimistic UI and rollback
interface OrderState {
  pendingOrders: MedicationRequest[];
  confirmedOrders: MedicationRequest[];
  failedOrders: Array<{ order: MedicationRequest; error: string }>;
  
  submitOrder: (order: MedicationRequest) => Promise<void>;
  confirmOrder: (orderId: string) => void;
  failOrder: (orderId: string, error: string) => void;
  rollbackOrder: (orderId: string) => void;
}

const useOrderStore = create<OrderState>()(
  devtools(
    immer((set, get) => ({
      pendingOrders: [],
      confirmedOrders: [],
      failedOrders: [],

      submitOrder: async (order) => {
        // Optimistically add to pending
        set((state) => {
          state.pendingOrders.push(order);
        }, false, 'order/submitOrder');

        try {
          const result = await fhirApi.create('MedicationRequest', order);
          
          // Move from pending to confirmed
          set((state) => {
            const index = state.pendingOrders.findIndex((o) => o.id === order.id);
            if (index !== -1) {
              state.pendingOrders.splice(index, 1);
            }
            state.confirmedOrders.push(result);
          }, false, 'order/confirmOrder');
        } catch (error) {
          // Move from pending to failed
          set((state) => {
            const index = state.pendingOrders.findIndex((o) => o.id === order.id);
            if (index !== -1) {
              state.pendingOrders.splice(index, 1);
            }
            state.failedOrders.push({
              order,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }, false, 'order/failOrder');
          
          throw error;
        }
      },

      confirmOrder: (orderId) =>
        set((state) => {
          const order = state.pendingOrders.find((o) => o.id === orderId);
          if (order) {
            state.pendingOrders = state.pendingOrders.filter((o) => o.id !== orderId);
            state.confirmedOrders.push(order);
          }
        }, false, 'order/confirm'),

      failOrder: (orderId, error) =>
        set((state) => {
          const order = state.pendingOrders.find((o) => o.id === orderId);
          if (order) {
            state.pendingOrders = state.pendingOrders.filter((o) => o.id !== orderId);
            state.failedOrders.push({ order, error });
          }
        }, false, 'order/fail'),

      rollbackOrder: (orderId) =>
        set((state) => {
          state.pendingOrders = state.pendingOrders.filter((o) => o.id !== orderId);
          // Also remove from confirmed if present
          state.confirmedOrders = state.confirmedOrders.filter((o) => o.id !== orderId);
        }, false, 'order/rollback'),
    })),
    { name: 'OrderStore' }
  )
);
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Boilerplate** | 10/10 | Minimal boilerplate, maximum productivity |
| **TypeScript** | 9/10 | Excellent type inference |
| **Performance** | 9/10 | Selective subscription prevents unnecessary re-renders |
| **DevTools** | 8/10 | Redux DevTools integration for debugging |
| **Clinical Safety** | 7/10 | Requires custom optimistic update/rollback patterns |
| **Audit Trail** | 6/10 | Middleware can log actions; requires custom implementation |

> **Recommendation:** Zustand is the **top recommendation** for Clinical OS state management. Its minimal boilerplate, excellent TypeScript support, and selective subscriptions make it ideal for clinical applications. The immer middleware enables immutable updates with mutable syntax, reducing bug potential in complex state transitions.

---

### 5.2 Jotai (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/pmndrs/jotai](https://github.com/pmndrs/jotai) |
| **License** | MIT License |
| **GitHub Stars** | 22,000+ |
| **Bundle Size** | ~5 KB (core) |
| **Language** | TypeScript |
| **Maintainer** | Poimandres (pmndrs) community |
| **First Release** | 2020 |

#### Overview

Jotai is a primitive, flexible state management library for React. It takes an atomic approach to global state management, inspired by Recoil. Atoms are units of state that components can subscribe to individually, providing automatic optimization by only re-rendering when the atom's value changes. Derived atoms enable computed state, and async atoms support data fetching.

#### Key Features

- **Atomic State:** Atoms as units of state with individual subscriptions
- **Derived Atoms:** Computed state derived from other atoms
- **Async Atoms:** Built-in async/await support for data fetching
- **TypeScript First:** Full type safety with inference
- **React 18 Concurrent Features:** Compatible with Suspense and transitions
- **DevTools:** Redux DevTools integration
- **Utils Package:** atomWithStorage, atomWithReset, splitAtom, selectAtom
- **Small Bundle:** ~5 KB core

#### Clinical OS Atoms

```tsx
// Clinical OS atomic state with Jotai
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { focusAtom } from 'jotai-optics';

import { Patient, Encounter, Observation } from 'fhir/r4';

// Base atoms
const selectedPatientIdAtom = atom<string | null>(null);
const patientsAtom = atom<Patient[]>([]);
const encountersAtom = atom<Record<string, Encounter[]>>({});
const observationsAtom = atom<Record<string, Observation[]>>({});

// Derived atoms
const selectedPatientAtom = atom((get) => {
  const patientId = get(selectedPatientIdAtom);
  const patients = get(patientsAtom);
  return patients.find((p) => p.id === patientId) || null;
});

const selectedPatientEncountersAtom = atom((get) => {
  const patientId = get(selectedPatientIdAtom);
  const encounters = get(encountersAtom);
  return patientId ? encounters[patientId] || [] : [];
});

const selectedPatientObservationsAtom = atom((get) => {
  const patientId = get(selectedPatientIdAtom);
  const observations = get(observationsAtom);
  return patientId ? observations[patientId] || [] : [];
});

// Async atom for patient search
const patientSearchQueryAtom = atom('');
const patientSearchResultsAtom = atom(async (get) => {
  const query = get(patientSearchQueryAtom);
  if (!query || query.length < 2) return [];
  
  const response = await fetch(
    `/fhir/Patient?name=${encodeURIComponent(query)}&_count=20`
  );
  const bundle = await response.json();
  return bundle.entry?.map((e: any) => e.resource as Patient) || [];
});

// Persisted atoms
const sidebarCollapsedAtom = atomWithStorage('clinical-sidebar-collapsed', false);
const themeAtom = atomWithStorage('clinical-theme', 'light');
const recentPatientsAtom = atomWithStorage<string[]>('clinical-recent-patients', []);

// Notification atoms
const notificationsAtom = atom<ClinicalNotification[]>([]);

const addNotificationAtom = atom(null, (get, set, notification: ClinicalNotification) => {
  const current = get(notificationsAtom);
  set(notificationsAtom, [notification, ...current].slice(0, 50));
});

// Computed atoms
const unreadNotificationsCountAtom = atom((get) => {
  return get(notificationsAtom).filter((n) => !n.read).length;
});

const criticalNotificationsAtom = atom((get) => {
  return get(notificationsAtom).filter((n) => n.type === 'critical');
});

// Component usage
const PatientSearch = () => {
  const [query, setQuery] = useAtom(patientSearchQueryAtom);
  const [results] = useAtom(patientSearchResultsAtom); // Suspense-enabled
  const setPatientId = useSetAtom(selectedPatientIdAtom);

  return (
    <div className="patient-search">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search patients..."
        aria-label="Search patients"
      />
      <Suspense fallback={<PatientSearchSkeleton />}>
        <PatientSearchResults 
          results={results} 
          onSelect={(patient) => setPatientId(patient.id)} 
        />
      </Suspense>
    </div>
  );
};

const NotificationBadge = () => {
  const count = useAtomValue(unreadNotificationsCountAtom);
  const criticalCount = useAtomValue(criticalNotificationsAtom).length;

  return (
    <button className="notification-btn" aria-label={`${count} unread notifications`}>
      <BellIcon />
      {count > 0 && (
        <span className={`badge ${criticalCount > 0 ? 'badge-critical' : ''}`}>
          {count}
        </span>
      )}
    </button>
  );
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Boilerplate** | 9/10 | Very minimal; atoms are simple declarations |
| **TypeScript** | 9/10 | Excellent type inference |
| **Performance** | 9/10 | Fine-grained subscriptions minimize re-renders |
| **Async Support** | 9/10 | Built-in async atoms with Suspense integration |
| **DevTools** | 7/10 | DevTools support; less mature than Zustand/Redux |
| **Clinical Safety** | 7/10 | Requires custom patterns for optimistic updates |

> **Recommendation:** Jotai is an excellent alternative to Zustand for Clinical OS applications that benefit from **atomic, derived, and async state patterns**. Its Suspense integration is particularly valuable for clinical data fetching. Choose Jotai when you need fine-grained reactive state or when integrating with React 18 concurrent features.

---

### 5.3 Redux Toolkit (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/reduxjs/redux-toolkit](https://github.com/reduxjs/redux-toolkit) |
| **License** | MIT License |
| **GitHub Stars** | 11,000+ (RTK); 60,000+ (Redux) |
| **Bundle Size** | ~20 KB (RTK + RTK Query) |
| **Language** | TypeScript |
| **Maintainer** | Redux team (Mark Erikson, Lenz Weber) |
| **First Release** | 2019 (RTK); 2015 (Redux) |

#### Overview

Redux Toolkit (RTK) is the official, opinionated, batteries-included toolset for efficient Redux development. It simplifies Redux setup with `configureStore`, `createSlice`, and `createAsyncThunk`, while RTK Query provides advanced data fetching and caching. With decades of production use and the most mature ecosystem, Redux Toolkit remains the enterprise standard for state management.

#### Key Features

- **configureStore:** Simplified store setup with good defaults
- **createSlice:** Combines reducers and actions with immer integration
- **createAsyncThunk:** Async action creators with pending/fulfilled/rejected states
- **RTK Query:** Advanced data fetching with automatic caching, deduping, and invalidation
- **Entity Adapter:** Normalized state management for collections
- **Listener Middleware:** Async side effects without sagas
- **Redux DevTools:** Best-in-class developer tools
- **TypeScript:** Full type safety
- **Ecosystem:** Largest state management ecosystem

#### Clinical OS with Redux Toolkit

```tsx
// Clinical OS state with Redux Toolkit
import { createSlice, createAsyncThunk, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import type { PayloadAction } from '@reduxjs/toolkit';
import { Patient, Encounter, Bundle } from 'fhir/r4';

// Async thunks for clinical data
const fetchPatient = createAsyncThunk(
  'patient/fetchPatient',
  async (patientId: string, { rejectWithValue }) => {
    try {
      const response = await fetch(`/fhir/Patient/${patientId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as Patient;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Failed to fetch patient');
    }
  }
);

const searchPatients = createAsyncThunk(
  'patient/searchPatients',
  async (query: string, { rejectWithValue }) => {
    try {
      const response = await fetch(`/fhir/Patient?name=${encodeURIComponent(query)}&_count=50`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bundle = (await response.json()) as Bundle;
      return bundle.entry?.map((e) => e.resource as Patient) || [];
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : 'Search failed');
    }
  }
);

// Patient slice
interface PatientState {
  selectedPatient: Patient | null;
  searchResults: Patient[];
  recentPatients: Patient[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: PatientState = {
  selectedPatient: null,
  searchResults: [],
  recentPatients: [],
  status: 'idle',
  error: null,
};

const patientSlice = createSlice({
  name: 'patient',
  initialState,
  reducers: {
    selectPatient: (state, action: PayloadAction<Patient>) => {
      state.selectedPatient = action.payload;
      // Add to recent patients
      state.recentPatients = [
        action.payload,
        ...state.recentPatients.filter((p) => p.id !== action.payload.id),
      ].slice(0, 10);
    },
    clearPatient: (state) => {
      state.selectedPatient = null;
    },
    clearSearch: (state) => {
      state.searchResults = [];
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPatient.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchPatient.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.selectedPatient = action.payload;
      })
      .addCase(fetchPatient.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(searchPatients.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(searchPatients.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.searchResults = action.payload;
      })
      .addCase(searchPatients.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

// RTK Query for FHIR API
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const fhirApi = createApi({
  reducerPath: 'fhirApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/fhir',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
      }
      headers.set('Accept', 'application/fhir+json');
      return headers;
    },
  }),
  tagTypes: ['Patient', 'Encounter', 'Observation', 'MedicationRequest'],
  endpoints: (builder) => ({
    getPatient: builder.query<Patient, string>({
      query: (id) => `/Patient/${id}`,
      providesTags: (result, error, id) => [{ type: 'Patient', id }],
    }),
    
    searchPatients: builder.query<Patient[], { name?: string; count?: number }>({
      query: (params) => ({
        url: '/Patient',
        params: {
          name: params.name,
          _count: params.count || 20,
        },
      }),
      providesTags: ['Patient'],
    }),
    
    updatePatient: builder.mutation<Patient, Partial<Patient> & { id: string }>({
      query: ({ id, ...patch }) => ({
        url: `/Patient/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Patient', id }],
    }),
    
    getPatientEncounters: builder.query<Encounter[], string>({
      query: (patientId) => `/Encounter?patient=${patientId}&_sort=-date`,
      providesTags: ['Encounter'],
    }),
  }),
});

// Export hooks
export const {
  useGetPatientQuery,
  useSearchPatientsQuery,
  useUpdatePatientMutation,
  useGetPatientEncountersQuery,
} = fhirApi;

// Store configuration
const store = configureStore({
  reducer: {
    patient: patientSlice.reducer,
    auth: authSlice.reducer, // Defined elsewhere
    ui: uiSlice.reducer, // Defined elsewhere
    [fhirApi.reducerPath]: fhirApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(fhirApi.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// React integration with hooks
import { useSelector, useDispatch, TypedUseSelectorHook } from 'react-redux';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Component usage
const PatientDetail = ({ patientId }: { patientId: string }) => {
  const { data: patient, isLoading, error } = useGetPatientQuery(patientId);
  const { data: encounters } = useGetPatientEncountersQuery(patientId);

  if (isLoading) return <ClinicalSpinner />;
  if (error) return <ClinicalError error={error} />;
  if (!patient) return <div>Patient not found</div>;

  return (
    <div className="patient-detail">
      <PatientHeader patient={patient} />
      <EncounterHistory encounters={encounters || []} />
    </div>
  );
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Maturity** | 10/10 | Most mature state management solution |
| **Ecosystem** | 10/10 | Largest ecosystem, most middleware |
| **RTK Query** | 9/10 | Excellent data fetching with automatic caching |
| **DevTools** | 10/10 | Best-in-class debugging and time-travel |
| **TypeScript** | 8/10 | Good type safety; requires some explicit typing |
| **Boilerplate** | 6/10 | More boilerplate than Zustand/Jotai |
| **Bundle Size** | 6/10 | Largest of the three (~20 KB) |
| **Clinical Safety** | 8/10 | RTK Query provides optimistic updates and rollback |

> **Recommendation:** Redux Toolkit is recommended for **large, complex Clinical OS applications** with many developers, extensive caching requirements, or need for the mature Redux ecosystem. RTK Query's automatic caching and invalidation is particularly valuable for FHIR data. For smaller teams or simpler applications, Zustand or Jotai may be more productive.

---

## Section 5 Summary: State Management Comparison

| Feature | Zustand | Jotai | Redux Toolkit |
|---------|---------|-------|---------------|
| **License** | MIT | MIT | MIT |
| **Stars** | 47,000+ | 22,000+ | 11,000+ (RTK) |
| **Bundle Size** | 1.1 KB | ~5 KB | ~20 KB |
| **Paradigm** | Flux-like store | Atomic | Flux with slices |
| **Boilerplate** | Minimal | Minimal | Moderate |
| **TypeScript** | Excellent | Excellent | Good |
| **DevTools** | Good | Moderate | Excellent |
| **Async Support** | Built-in | Suspense atoms | createAsyncThunk + RTK Query |
| **Caching** | Manual | Manual | RTK Query (automatic) |
| **Team Size** | Small-Medium | Small-Medium | Large |
| **Clinical OS Fit** | Excellent | Excellent | Large-scale apps |

### Recommended State Architecture

```
Small-Medium Clinical OS (1-10 developers):
  Zustand + Immer + DevTools
  
Medium-Large Clinical OS (10+ developers):
  Redux Toolkit + RTK Query
  
Reactive/Concurrent Clinical OS (React 18+):
  Jotai + Suspense
  
Hybrid (recommended for most):
  Zustand (global UI/auth state)
  + React Query/TanStack Query (server state / FHIR data)
  + Jotai (local component state where needed)
```

---

## Section 6: Accessibility Libraries

> Accessibility in clinical systems is not optional -- it is a legal requirement (ADA, Section 508, EN 301 549) and an ethical imperative. Clinical staff with disabilities must be able to perform patient care tasks with the same efficiency and safety as their peers. This section covers the essential accessibility libraries for building inclusive Clinical OS interfaces.

---

### 6.1 @reach/menu-button (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/reach/reach-ui](https://github.com/reach/reach-ui) (monorepo) |
| **License** | MIT License |
| **Package** | `@reach/menu-button` |
| **Maintainer** | Ryan Florence (Reach UI team) |

#### Overview

@reach/menu-button provides an accessible menu button component following the WAI-ARIA Authoring Practices. It handles keyboard navigation (arrow keys, Escape, Tab), focus management, ARIA attributes, and screen reader announcements automatically. While the Reach UI project is in maintenance mode (as accessibility features were merged into Radix UI and React Router), the patterns remain the gold standard for accessible menu buttons.

#### Key Features

- **WAI-ARIA Compliant:** Follows ARIA Authoring Practices for menu buttons
- **Keyboard Navigation:** Arrow keys, Home, End, Escape, Tab, Enter, Space
- **Focus Management:** Proper focus trapping and restoration
- **Screen Reader Support:** Announces menu state and item count
- **Portal Support:** Renders menu in portal for proper z-index handling
- **Custom Positioning:** Flexible menu positioning relative to trigger

#### Clinical OS Application

```tsx
// Clinical action menu with accessible dropdown
import {
  Menu,
  MenuList,
  MenuButton,
  MenuItem,
  MenuLink,
  MenuPopover,
  MenuItems,
} from '@reach/menu-button';
import '@reach/menu-button/styles.css';

interface PatientActionMenuProps {
  patientId: string;
  onViewChart: () => void;
  onOrderLabs: () => void;
  onPrescribe: () => void;
  onSchedule: () => void;
  onTransfer: () => void;
  onDischarge: () => void;
  canPrescribe: boolean;
  canDischarge: boolean;
}

const PatientActionMenu = ({
  patientId,
  onViewChart,
  onOrderLabs,
  onPrescribe,
  onSchedule,
  onTransfer,
  onDischarge,
  canPrescribe,
  canDischarge,
}: PatientActionMenuProps) => {
  return (
    <Menu>
      <MenuButton 
        className="btn btn-outline clinical-action-btn"
        aria-label="Patient actions"
      >
        Actions <span aria-hidden>▾</span>
      </MenuButton>
      <MenuPopover className="clinical-menu-popover">
        <MenuItems className="clinical-menu-items">
          <MenuItem onSelect={onViewChart} className="clinical-menu-item">
            <ChartIcon aria-hidden /> View Chart
          </MenuItem>
          <MenuItem onSelect={onOrderLabs} className="clinical-menu-item">
            <LabIcon aria-hidden /> Order Labs
          </MenuItem>
          {canPrescribe && (
            <MenuItem onSelect={onPrescribe} className="clinical-menu-item">
              <PrescriptionIcon aria-hidden /> Prescribe Medication
            </MenuItem>
          )}
          <MenuItem onSelect={onSchedule} className="clinical-menu-item">
            <CalendarIcon aria-hidden /> Schedule Appointment
          </MenuItem>
          <MenuItem onSelect={onTransfer} className="clinical-menu-item">
            <TransferIcon aria-hidden /> Transfer Patient
          </MenuItem>
          {canDischarge && (
            <>
              <hr className="clinical-menu-divider" />
              <MenuItem 
                onSelect={onDischarge} 
                className="clinical-menu-item clinical-menu-item-danger"
              >
                <DischargeIcon aria-hidden /> Discharge Patient
              </MenuItem>
            </>
          )}
        </MenuItems>
      </MenuPopover>
    </Menu>
  );
};
```

#### Clinical Safety Considerations

- **Keyboard-Only Operation:** Surgeons, radiologists, and sterile staff may need keyboard-only operation
- **Screen Reader Compatibility:** Visually impaired clinical staff must receive full information
- **Focus Visibility:** High-contrast focus indicators for low-vision users
- **Error Prevention:** Dangerous actions (discharge, medication order) require confirmation

> **Recommendation:** While @reach/menu-button provides excellent patterns, new projects should use **@radix-ui/react-menu** which incorporates the same accessibility features with an actively maintained codebase.

---

### 6.2 @reach/disclosure (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/reach/reach-ui](https://github.com/reach/reach-ui) |
| **License** | MIT License |
| **Package** | `@reach/disclosure` |

#### Overview

@reach/disclosure provides accessible disclosure (collapsible sections) components following the WAI-ARIA Authoring Practices. Disclosures are the foundation of collapsible sidebar navigation, accordion-style clinical forms, and expandable patient data sections. They handle keyboard interaction, ARIA expanded/collapsed states, and focus management.

#### Key Features

- **WAI-ARIA Compliant:** `button` with `aria-expanded` and `aria-controls`
- **Keyboard Support:** Enter and Space to toggle, Tab to navigate
- **State Management:** Controlled and uncontrolled modes
- **Animation Support:** Works with CSS transitions for smooth expand/collapse
- **Nested Support:** Multiple disclosures can be composed

#### Clinical OS Application

```tsx
// Collapsible clinical sections with accessible disclosure
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@reach/disclosure';
import '@reach/disclosure/styles.css';

interface ClinicalSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  alert?: boolean;
  children: React.ReactNode;
}

const ClinicalDisclosureSection = ({
  id,
  title,
  icon,
  alert,
  children,
  defaultOpen = false,
}: ClinicalSection & { defaultOpen?: boolean }) => {
  return (
    <Disclosure open={defaultOpen}>
      <DisclosureButton 
        className={`clinical-disclosure-btn${alert ? ' clinical-disclosure-alert' : ''}`}
      >
        {icon}
        <span className="clinical-disclosure-title">{title}</span>
        {alert && (
          <span className="clinical-alert-indicator" aria-label="Has alerts">
            <AlertIcon />
          </span>
        )}
        <ChevronIcon className="clinical-disclosure-chevron" aria-hidden />
      </DisclosureButton>
      <DisclosurePanel className="clinical-disclosure-panel">
        {children}
      </DisclosurePanel>
    </Disclosure>
  );
};

// Patient chart with collapsible sections
const PatientChart = ({ patient }: { patient: Patient }) => {
  return (
    <div className="patient-chart" role="region" aria-label="Patient chart">
      <ClinicalDisclosureSection
        id="demographics"
        title="Demographics"
        icon={<UserIcon />}
        defaultOpen={true}
      >
        <DemographicsPanel patient={patient} />
      </ClinicalDisclosureSection>
      
      <ClinicalDisclosureSection
        id="allergies"
        title="Allergies & Adverse Reactions"
        icon={<AllergyIcon />}
        alert={patient.allergyAlert}
      >
        <AllergyList patientId={patient.id} />
      </ClinicalDisclosureSection>
      
      <ClinicalDisclosureSection
        id="medications"
        title="Active Medications"
        icon={<MedicationIcon />}
      >
        <MedicationList patientId={patient.id} />
      </ClinicalDisclosureSection>
      
      <ClinicalDisclosureSection
        id="vitals"
        title="Vital Signs"
        icon={<VitalsIcon />}
        alert={patient.vitalsAlert}
      >
        <VitalsPanel patientId={patient.id} />
      </ClinicalDisclosureSection>
      
      <ClinicalDisclosureSection
        id="lab-results"
        title="Laboratory Results"
        icon={<LabIcon />}
        alert={patient.labAlert}
      >
        <LabResultsPanel patientId={patient.id} />
      </ClinicalDisclosureSection>
      
      <ClinicalDisclosureSection
        id="imaging"
        title="Imaging & Radiology"
        icon={<ImagingIcon />}
      >
        <ImagingPanel patientId={patient.id} />
      </ClinicalDisclosureSection>
      
      <ClinicalDisclosureSection
        id="notes"
        title="Clinical Notes"
        icon={<NotesIcon />}
      >
        <ClinicalNotesPanel patientId={patient.id} />
      </ClinicalDisclosureSection>
    </div>
  );
};
```

> **Recommendation:** For new projects, use **@radix-ui/react-collapsible** or **@radix-ui/react-accordion** which provide the same accessibility features with active maintenance and broader Radix UI ecosystem integration.

---

### 6.3 @radix-ui/react-collapsible (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/radix-ui/primitives](https://github.com/radix-ui/primitives) |
| **License** | MIT License |
| **GitHub Stars** | 18,700+ (primitives monorepo) |
| **Maintainer** | WorkOS (formerly Modulz) |

#### Overview

Radix UI Primitives is an open-source UI component library for building high-quality, accessible design systems and web apps. It provides unstyled, accessible components that handle the complex aspects of UI primitives: keyboard navigation, focus management, ARIA attributes, and screen reader support. Developers bring their own styling, giving complete visual control while maintaining accessibility compliance.

#### Key Accessible Primitives for Clinical OS

| Primitive | Clinical OS Use | Accessibility Features |
|-----------|----------------|----------------------|
| **Collapsible** | Expandable clinical sections | Keyboard, ARIA expanded |
| **Accordion** | Stacked clinical panels | Single/multiple expand, keyboard nav |
| **Dialog** | Clinical alerts, confirmation modals | Focus trap, Escape, ARIA |
| **Dropdown Menu** | Action menus, context menus | Arrow key nav, typeahead, ARIA |
| **Popover** | Tooltips, info panels | Focus management, portal |
| **Tabs** | Clinical view switching | Arrow key nav, ARIA selected |
| **Tooltip** | Icon explanations, abbreviations | Delay, keyboard support |
| **Checkbox** | Order sets, form fields | Indeterminate, ARIA |
| **Radio Group** | Single-selection clinical forms | Arrow key nav, ARIA |
| **Select** | Dropdown selections | Typeahead, keyboard, ARIA |
| **Switch** | Toggle settings | ARIA checked, keyboard |
| **Slider** | Pain scales, severity ratings | Arrow key, Home, End, ARIA |
| **Toast** | Clinical notifications | Live region, auto-dismiss |
| **Alert Dialog** | Critical safety alerts | Focus trap, mandatory action |
| **Hover Card** | Preview on hover | Delay, keyboard support |
| **Scroll Area** | Custom scrollbars | Keyboard scroll, ARIA |
| **Separator** | Visual dividers | ARIA orientation |
| **Aspect Ratio** | Image/video containers | Maintains proportions |

#### Clinical OS Collapsible Sidebar with Radix

```tsx
// Accessible clinical sidebar with Radix UI primitives
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ChevronRight, Activity, Users, Beaker, Calendar, Settings } from 'lucide-react';
import { useState } from 'react';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  badge?: number;
  children?: Omit<SidebarItem, 'children'>[];
}

const clinicalNavigation: SidebarItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <Activity size={20} />,
    path: '/',
  },
  {
    id: 'patients',
    label: 'Patients',
    icon: <Users size={20} />,
    path: '/patients',
    badge: 3,
  },
  {
    id: 'clinical',
    label: 'Clinical',
    icon: <Stethoscope size={20} />,
    children: [
      { id: 'orders', label: 'Orders', icon: <Clipboard size={18} />, path: '/clinical/orders' },
      { id: 'vitals', label: 'Vitals', icon: <HeartPulse size={18} />, path: '/clinical/vitals' },
      { id: 'medications', label: 'Medications', icon: <Pills size={18} />, path: '/clinical/medications' },
    ],
  },
  {
    id: 'laboratory',
    label: 'Laboratory',
    icon: <Beaker size={20} />,
    children: [
      { id: 'results', label: 'Results', icon: <FileText size={18} />, path: '/lab/results' },
      { id: 'pending', label: 'Pending', icon: <Clock size={18} />, path: '/lab/pending', badge: 12 },
    ],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: <Calendar size={20} />,
    path: '/schedule',
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: <Settings size={20} />,
    children: [
      { id: 'users', label: 'Users', icon: <UserCog size={18} />, path: '/admin/users' },
      { id: 'audit', label: 'Audit Logs', icon: <Shield size={18} />, path: '/admin/audit' },
    ],
  },
];

const ClinicalSidebarItem = ({
  item,
  collapsed,
  depth = 0,
}: {
  item: SidebarItem;
  collapsed: boolean;
  depth?: number;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isActive = item.path ? location.pathname === item.path : false;
  const hasChildren = item.children && item.children.length > 0;

  if (hasChildren) {
    return (
      <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip.Provider delayDuration={collapsed ? 100 : 1000}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Collapsible.Trigger
                className={`sidebar-item sidebar-trigger${isActive ? ' sidebar-active' : ''}`}
                style={{ paddingLeft: collapsed ? '16px' : `${16 + depth * 12}px` }}
                aria-expanded={isOpen}
              >
                <span className="sidebar-icon">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="sidebar-label">{item.label}</span>
                    {item.badge ? (
                      <span className="sidebar-badge" aria-label={`${item.badge} items`}>
                        {item.badge}
                      </span>
                    ) : null}
                    <ChevronRight
                      size={16}
                      className={`sidebar-chevron${isOpen ? ' sidebar-chevron-open' : ''}`}
                      aria-hidden
                    />
                  </>
                )}
              </Collapsible.Trigger>
            </Tooltip.Trigger>
            {collapsed && (
              <Tooltip.Portal>
                <Tooltip.Content 
                  className="sidebar-tooltip" 
                  side="right" 
                  sideOffset={8}
                >
                  {item.label}
                  <Tooltip.Arrow className="sidebar-tooltip-arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            )}
          </Tooltip.Root>
        </Tooltip.Provider>

        <Collapsible.Content className="sidebar-collapsible-content">
          {item.children?.map((child) => (
            <ClinicalSidebarItem
              key={child.id}
              item={child}
              collapsed={collapsed}
              depth={depth + 1}
            />
          ))}
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }

  return (
    <Tooltip.Provider delayDuration={collapsed ? 100 : 1000}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Link
            to={item.path || '#'}
            className={`sidebar-item${isActive ? ' sidebar-active' : ''}`}
            style={{ paddingLeft: collapsed ? '16px' : `${16 + depth * 12}px` }}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {!collapsed && (
              <>
                <span className="sidebar-label">{item.label}</span>
                {item.badge ? (
                  <span className="sidebar-badge" aria-label={`${item.badge} items`}>
                    {item.badge}
                  </span>
                ) : null}
              </>
            )}
          </Link>
        </Tooltip.Trigger>
        {collapsed && (
          <Tooltip.Portal>
            <Tooltip.Content className="sidebar-tooltip" side="right" sideOffset={8}>
              {item.label}
              {item.badge ? ` (${item.badge})` : ''}
              <Tooltip.Arrow className="sidebar-tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **ARIA Compliance** | 10/10 | Follows WAI-ARIA Authoring Practices exactly |
| **Keyboard Navigation** | 10/10 | Comprehensive keyboard support across all primitives |
| **Focus Management** | 10/10 | Proper focus trapping, restoration, and visibility |
| **Screen Reader** | 10/10 | Full screen reader support with proper announcements |
| **Customization** | 10/10 | Completely unstyled; full visual control |
| **TypeScript** | 10/10 | Excellent TypeScript support |
| **Ecosystem** | 9/10 | Part of larger Radix UI ecosystem; shadcn/ui built on Radix |

> **Recommendation:** **@radix-ui/react-collapsible** and the full Radix UI Primitives suite are the **top recommendation** for accessible clinical UI components. The combination of complete accessibility compliance, unstyled architecture, and TypeScript support makes Radix the ideal foundation for Clinical OS UI development. shadcn/ui, built on Radix primitives, provides an excellent starting point for clinical design systems.

---

### 6.4 react-aria (Apache-2.0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/adobe/react-spectrum](https://github.com/adobe/react-spectrum) (monorepo) |
| **License** | Apache License 2.0 |
| **GitHub Stars** | 14,000+ (react-spectrum monorepo) |
| **Maintainer** | Adobe |
| **First Release** | 2019 |

#### Overview

react-aria is a library of React Hooks and unstyled components that provides accessible UI primitives for design systems. Part of Adobe's React Spectrum project, react-aria implements accessibility and behavior according to WAI-ARIA Authoring Practices, including full screen reader and keyboard navigation support. All components have been tested across a wide variety of screen readers and devices. react-aria supports 30+ languages, including right-to-left languages, internationalized date and number formatting.

#### Key Features

- **WAI-ARIA Authoring Practices:** Implements ARIA patterns exactly as specified
- **Cross-Device Testing:** Tested across all major screen readers and assistive technologies
- **30+ Languages:** Full internationalization support
- **RTL Support:** Right-to-left language support built-in
- **Unstyled:** No rendering or DOM structure imposed; full styling freedom
- **Adaptive:** Mouse, touch, keyboard, and screen reader interactions
- **React Stately:** Companion library for cross-platform state management
- **React Spectrum:** Full Adobe design system built on react-aria

#### react-aria Components for Clinical OS

| Hook/Component | Clinical OS Use | Accessibility Pattern |
|----------------|----------------|----------------------|
| **useButton** | All buttons, action items | Button ARIA pattern |
| **useToggleButton** | Toggle settings, switches | Toggle button pattern |
| **useCheckbox** | Form selections, order sets | Checkbox pattern |
| **useRadioGroup** | Single-select clinical forms | Radio group pattern |
| **useSelect** | Dropdown selections | Select/Combobox pattern |
| **useComboBox** | ICD-10 search, medication lookup | Combobox pattern |
| **useListBox** | Multi-select lists | Listbox pattern |
| **useMenuTrigger** | Action menus | Menu button pattern |
| **useDialog** | Clinical alerts, modals | Dialog pattern |
| **useModalOverlay** | Overlay management | Modal dialog pattern |
| **usePopover** | Info panels, pickers | Popover pattern |
| **useTooltip** | Icon explanations | Tooltip pattern |
| **useTabs** | Clinical view switching | Tabs pattern |
| **useTable** | Patient lists, lab results | Grid/Table pattern |
| **useGridList** | Interactive lists | Grid list pattern |
| **useSearchField** | Patient search | Search field pattern |
| **useTextField** | All text inputs | Text input pattern |
| **useNumberField** | Numeric clinical values | Spin button pattern |
| **useDateField** | Date of birth, encounter dates | Date picker pattern |
| **useDatePicker** | Scheduling, date selection | Date picker pattern |
| **useDateRangePicker** | Admission/discharge dates | Date range picker |
| **useCalendar** | Scheduling calendar | Calendar pattern |
| **useRangeCalendar** | Date range selection | Range calendar |
| **useSlider** | Pain scales, severity ratings | Slider pattern |
| **useSwitch** | Toggle settings | Switch pattern |
| **useSeparator** | Visual dividers | Separator pattern |
| **useBreadcrumbs** | Navigation breadcrumbs | Breadcrumb pattern |
| **useLink** | Navigation links | Link pattern |
| **useProgressBar** | Loading indicators | Progress bar pattern |
| **useMeter** | Vital sign gauges | Meter pattern |
| **useCollapsible** | Expandable sections | Disclosure pattern |

#### Clinical OS Example: Accessible Pain Scale Slider

```tsx
// Accessible pain scale with react-aria useSlider
import { useSlider, useSliderThumb } from '@react-aria/slider';
import { useSliderState } from '@react-stately/slider';
import { VisuallyHidden } from '@react-aria/visually-hidden';
import { useRef } from 'react';
import type { AriaSliderProps } from '@react-aria/slider';

interface PainScaleProps extends AriaSliderProps {
  onValueCommit?: (value: number) => void;
}

const PainScaleSlider = (props: PainScaleProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  const state = useSliderState({ ...props, numberFormatter });
  const { groupProps, trackProps, labelProps, outputProps } = useSlider(
    props,
    state,
    trackRef
  );

  return (
    <div {...groupProps} className="pain-scale" role="region" aria-label="Pain scale assessment">
      {/* Label with current value */}
      <div className="pain-scale-header">
        <label {...labelProps} className="pain-scale-label">
          Pain Level (0-10)
        </label>
        <output {...outputProps} className={`pain-scale-value pain-level-${state.getThumbValue(0)}`}>
          {state.getThumbValue(0)}
        </output>
      </div>

      {/* Pain descriptor */}
      <div className="pain-scale-descriptor" aria-live="polite">
        {getPainDescriptor(state.getThumbValue(0))}
      </div>

      {/* Visual scale */}
      <div className="pain-scale-visual">
        <span className="pain-scale-anchor">No Pain (0)</span>
        <span className="pain-scale-anchor">Worst Pain (10)</span>
      </div>

      {/* Slider track */}
      <div {...trackProps} ref={trackRef} className="pain-scale-track">
        {/* Color-coded track segments */}
        {[0, 1, 2, 3].map((segment) => (
          <div
            key={segment}
            className={`pain-track-segment pain-track-segment-${segment}`}
            style={{ width: '25%' }}
          />
        ))}

        {/* Thumb */}
        <PainThumb index={0} state={state} trackRef={trackRef} />
      </div>

      {/* Numeric scale labels */}
      <div className="pain-scale-ticks" aria-hidden="true">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className="pain-scale-tick">
            {i}
          </span>
        ))}
      </div>

      {/* Clinical action prompt for high pain */}
      {state.getThumbValue(0) >= 7 && (
        <div className="pain-scale-alert" role="alert">
          <AlertIcon />
          <span>Consider pain management intervention. Document assessment and notify provider.</span>
        </div>
      )}
    </div>
  );
};

// Individual thumb component
const PainThumb = ({
  index,
  state,
  trackRef,
}: {
  index: number;
  state: ReturnType<typeof useSliderState>;
  trackRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { thumbProps, inputProps, isDragging } = useSliderThumb(
    { index, trackRef, inputRef },
    state
  );

  return (
    <div
      {...thumbProps}
      className={`pain-thumb${isDragging ? ' pain-thumb-dragging' : ''}`}
      style={{
        ...thumbProps.style,
        backgroundColor: getPainColor(state.getThumbValue(index)),
      }}
    >
      <VisuallyHidden>
        <input ref={inputRef} {...inputProps} />
      </VisuallyHidden>
    </div>
  );
};

// Helper functions
const getPainDescriptor = (level: number): string => {
  if (level === 0) return 'No pain';
  if (level <= 2) return 'Mild pain - noticeable but tolerable';
  if (level <= 4) return 'Moderate pain - interferes with activities';
  if (level <= 6) return 'Severe pain - significantly limits activities';
  if (level <= 8) return 'Very severe pain - incapacitating';
  return 'Worst possible pain - requires immediate intervention';
};

const getPainColor = (level: number): string => {
  if (level <= 2) return '#10B981'; // Green
  if (level <= 4) return '#F59E0B'; // Amber
  if (level <= 6) return '#F97316'; // Orange
  return '#DC2626'; // Red
};
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **ARIA Compliance** | 10/10 | Gold standard -- tested across all major screen readers |
| **Internationalization** | 10/10 | 30+ languages, RTL support, localized date/number formatting |
| **Keyboard Navigation** | 10/10 | Comprehensive keyboard patterns for every component |
| **Cross-Device Testing** | 10/10 | Extensive testing across screen readers, devices, and platforms |
| **TypeScript** | 10/10 | Full type safety |
| **Bundle Size** | 7/10 | Modular imports reduce bundle; larger than Radix for individual components |
| **Learning Curve** | 7/10 | Hook-based API requires understanding of ARIA patterns |
| **Clinical Safety** | 10/10 | Best-in-class accessibility ensures safe operation by all clinical staff |

> **Recommendation:** react-aria is the **gold standard for accessibility in Clinical OS development**. Its Apache 2.0 license is enterprise-friendly, and its comprehensive ARIA implementation ensures compliance with accessibility regulations. Use react-aria for high-stakes clinical interactions: medication ordering, allergy documentation, consent management, and critical alerts. Combine with Radix UI primitives for rapid development of standard clinical components.

---

## Section 6 Summary: Accessibility Libraries

| Library | ARIA Compliance | Keyboard | Screen Reader | TypeScript | Maintenance | Clinical OS Fit |
|---------|----------------|----------|---------------|------------|-------------|-----------------|
| **@reach/menu-button** | 10/10 | 10/10 | 10/10 | No | Maintenance | Use Radix instead |
| **@reach/disclosure** | 10/10 | 10/10 | 10/10 | No | Maintenance | Use Radix instead |
| **@radix-ui primitives** | 10/10 | 10/10 | 10/10 | Yes | Active | Excellent |
| **react-aria** | 10/10 | 10/10 | 10/10 | Yes | Active | Gold Standard |

### Recommended Accessibility Stack

```
@radix-ui/react-*        -- Standard clinical UI primitives (collapsible, dialog, tabs, tooltip)
react-aria               -- High-stakes clinical interactions (forms, medication orders, alerts)
@react-aria/visually-hidden  -- Screen-reader-only content
@react-stately/*         -- Cross-platform state management for accessible components
```

---

## Section 7: Testing Frameworks

> Testing in clinical systems is mission-critical. A bug in patient identification, medication dosing, or allergy checking can cause serious harm or death. Testing frameworks must support unit testing (for business logic), integration testing (for FHIR API interactions), component testing (for UI behavior), and end-to-end testing (for complete clinical workflows). All tests must be accessible to developers with disabilities and must validate accessibility compliance.

---

### 7.1 Vitest (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/vitest-dev/vitest](https://github.com/vitest-dev/vitest) |
| **License** | MIT License |
| **GitHub Stars** | 14,000+ |
| **Bundle Size** | N/A (dev dependency) |
| **Language** | TypeScript |
| **Maintainer** | VoidZero (Anthony Fu, patak) |
| **First Release** | 2021 |

#### Overview

Vitest is a next-generation testing framework powered by Vite. It is Jest-compatible, providing snapshot testing, coverage, mocking, and spies while leveraging Vite's configuration, plugins, and instant feedback. Vitest is the recommended test runner for modern Vite-based applications, offering significantly faster test execution than Jest through Vite's native ESM support and esbuild transformation.

#### Key Features

- **Vite Native:** Reuses Vite config, transformers, resolvers, and plugins
- **Jest Compatible:** Familiar API (`describe`, `it`, `expect`, `vi.fn()`)
- **TypeScript:** Native TypeScript and JSX support
- **ESM First:** Native ES module support without transpilation
- **Smart Watch Mode:** Instant test re-run on file changes (like HMR for tests)
- **Browser Mode:** Run tests in real browsers via WebdriverIO or Playwright
- **UI Dashboard:** Built-in test dashboard for visual test management
- **Code Coverage:** Native v8 or Istanbul coverage
- **Benchmarking:** Built-in benchmarking with Tinybench
- **In-Source Testing:** Tests co-located with source code
- **Concurrent Tests:** Parallel test execution
- **Snapshot Testing:** Jest-compatible snapshot format

#### Clinical OS Testing Patterns

```typescript
// FHIR utility tests with Vitest
import { describe, it, expect, vi } from 'vitest';
import { calculateBMI, formatPatientName, parseFhirDate } from './clinical-utils';

describe('Clinical Utilities', () => {
  describe('calculateBMI', () => {
    it('calculates BMI correctly for valid inputs', () => {
      expect(calculateBMI(70, 175)).toBeCloseTo(22.9, 1);
      expect(calculateBMI(90, 180)).toBeCloseTo(27.8, 1);
    });

    it('returns null for invalid inputs', () => {
      expect(calculateBMI(0, 175)).toBeNull();
      expect(calculateBMI(70, 0)).toBeNull();
      expect(calculateBMI(-1, 175)).toBeNull();
    });

    it('handles edge cases', () => {
      expect(calculateBMI(0.5, 50)).toBeCloseTo(2.0, 0);
    });
  });

  describe('formatPatientName', () => {
    it('formats FHIR HumanName correctly', () => {
      const name = { given: ['John'], family: 'Doe' };
      expect(formatPatientName(name)).toBe('John Doe');
    });

    it('handles multiple given names', () => {
      const name = { given: ['John', 'Jacob'], family: 'Smith' };
      expect(formatPatientName(name)).toBe('John Jacob Smith');
    });

    it('handles missing family name', () => {
      const name = { given: ['Jane'] };
      expect(formatPatientName(name)).toBe('Jane');
    });

    it('handles empty name', () => {
      expect(formatPatientName({})).toBe('Unknown');
      expect(formatPatientName(null)).toBe('Unknown');
    });

    it('handles prefix and suffix', () => {
      const name = { 
        prefix: ['Dr.'], 
        given: ['Robert'], 
        family: 'Johnson',
        suffix: ['Jr.']
      };
      expect(formatPatientName(name, { includePrefix: true, includeSuffix: true }))
        .toBe('Dr. Robert Johnson Jr.');
    });
  });

  describe('parseFhirDate', () => {
    it('parses FHIR date format', () => {
      const date = parseFhirDate('2024-01-15');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
      expect(date?.getMonth()).toBe(0); // January = 0
      expect(date?.getDate()).toBe(15);
    });

    it('parses FHIR datetime format', () => {
      const date = parseFhirDate('2024-01-15T14:30:00Z');
      expect(date).toBeInstanceOf(Date);
    });

    it('returns null for invalid dates', () => {
      expect(parseFhirDate('')).toBeNull();
      expect(parseFhirDate('invalid')).toBeNull();
      expect(parseFhirDate(null as any)).toBeNull();
    });
  });
});

// FHIR client tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FhirClient } from './fhir-client';

describe('FhirClient', () => {
  let client: FhirClient;

  beforeEach(() => {
    client = new FhirClient('https://fhir.example.com', 'test-token');
    vi.restoreAllMocks();
  });

  it('reads a Patient resource', async () => {
    const mockPatient = {
      resourceType: 'Patient',
      id: '123',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPatient,
    });

    const patient = await client.read('Patient', '123');
    expect(patient).toEqual(mockPatient);
    expect(fetch).toHaveBeenCalledWith(
      'https://fhir.example.com/Patient/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(client.read('Patient', '999')).rejects.toThrow('FHIR Error 404');
  });

  it('searches with parameters', async () => {
    const mockBundle = {
      resourceType: 'Bundle',
      total: 2,
      entry: [
        { resource: { resourceType: 'Patient', id: '1' } },
        { resource: { resourceType: 'Patient', id: '2' } },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockBundle,
    });

    const results = await client.search('Patient', { name: 'Smith', _count: '10' });
    expect(results.entry).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      'https://fhir.example.com/Patient?name=Smith&_count=10',
      expect.any(Object)
    );
  });
});
```

#### Clinical Test Configuration

```typescript
// vitest.config.ts for Clinical OS
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'Clinical OS Tests',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    // Browser mode for accessibility testing
    browser: {
      enabled: false, // Enable for accessibility tests
      name: 'chromium',
      provider: 'playwright',
    },
  },
});
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Speed** | 10/10 | Fastest test runner; instant watch mode |
| **TypeScript** | 10/10 | Native TS support |
| **Jest Compatibility** | 9/10 | Easy migration from Jest |
| **Browser Mode** | 8/10 | Real browser testing via Playwright |
| **Clinical Workflow Testing** | 7/10 | Unit/integration focused; E2E requires Playwright |
| **Accessibility Testing** | 6/10 | Requires axe-core or jest-axe integration |

> **Recommendation:** Vitest is the **recommended unit and integration test runner** for Clinical OS development. Its speed and Vite integration make it ideal for fast feedback during clinical feature development. Use browser mode for accessibility-critical component tests.

---

### 7.2 Playwright (Apache-2.0)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/microsoft/playwright](https://github.com/microsoft/playwright) |
| **License** | Apache License 2.0 |
| **GitHub Stars** | 72,000+ |
| **Language** | TypeScript, JavaScript, Python, Java, .NET |
| **Maintainer** | Microsoft |
| **First Release** | 2020 |
| **Browsers** | Chromium, Firefox, WebKit |

#### Overview

Playwright is a modern end-to-end testing framework from Microsoft that enables reliable testing across all modern browsers. It provides auto-waiting, web-first assertions, tracing, screenshots, video recording, and parallel execution. Playwright is the industry standard for E2E testing and is particularly well-suited for clinical workflow testing due to its reliability, speed, and cross-browser support.

#### Key Features

- **Cross-Browser:** Chromium, Firefox, WebKit support
- **Auto-Waiting:** Automatic waiting for elements; reduces flaky tests
- **Web-First Assertions:** Auto-retry assertions until conditions are met
- **Code Generation:** Record user interactions and generate test code
- **Tracing:** Full trace recording for post-mortem debugging
- **Screenshots & Video:** Automatic capture on failure
- **Parallel Execution:** Test across multiple workers and browsers
- **API Testing:** Test REST and GraphQL APIs without browser
- **Component Testing:** Test individual components in isolation
- **Mobile Emulation:** Test responsive designs on mobile viewports
- **Accessibility:** Built-in accessibility scanning via axe-core

#### Clinical OS E2E Testing

```typescript
// Clinical workflow E2E tests with Playwright
import { test, expect } from '@playwright/test';
import { ClinicalPage } from './page-objects/ClinicalPage';

test.describe('Patient Search Workflow', () => {
  let clinicalPage: ClinicalPage;

  test.beforeEach(async ({ page }) => {
    clinicalPage = new ClinicalPage(page);
    await clinicalPage.login('physician@example.com', 'password');
  });

  test('physician can search and view patient chart', async () => {
    // Navigate to patient search
    await clinicalPage.navigateToPatientSearch();
    
    // Search for patient
    await clinicalPage.searchPatient('Smith');
    
    // Verify search results
    const results = await clinicalPage.getSearchResults();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toContain('Smith');
    
    // Select first patient
    await clinicalPage.selectPatient(0);
    
    // Verify patient chart loads
    await expect(clinicalPage.page.locator('[data-testid="patient-name"]')).toBeVisible();
    await expect(clinicalPage.page.locator('[data-testid="patient-mrn"]')).toBeVisible();
    
    // Verify clinical sections are accessible
    await expect(clinicalPage.page.locator('text=Allergies')).toBeVisible();
    await expect(clinicalPage.page.locator('text=Medications')).toBeVisible();
    await expect(clinicalPage.page.locator('text=Vital Signs')).toBeVisible();
    
    // Accessibility scan
    const accessibilityScanResults = await clinicalPage.page.accessibility.snapshot();
    expect(accessibilityScanResults).toBeTruthy();
  });

  test('medication order workflow', async () => {
    // Navigate to patient
    await clinicalPage.navigateToPatient('12345');
    
    // Open order entry
    await clinicalPage.clickOrderEntry();
    
    // Select medication
    await clinicalPage.selectMedication('Amoxicillin 500mg');
    
    // Enter order details
    await clinicalPage.enterDosage('500');
    await clinicalPage.selectFrequency('BID');
    await clinicalPage.enterDuration('7 days');
    
    // Submit order
    await clinicalPage.submitOrder();
    
    // Verify confirmation
    await expect(clinicalPage.page.locator('text=Order submitted successfully')).toBeVisible();
    
    // Verify order appears in medication list
    await clinicalPage.navigateToMedications();
    await expect(clinicalPage.page.locator('text=Amoxicillin 500mg')).toBeVisible();
  });

  test('allergy alert displays for contraindicated medication', async () => {
    // Navigate to patient with known penicillin allergy
    await clinicalPage.navigateToPatient('allergy-test-patient');
    
    // Attempt to order penicillin
    await clinicalPage.clickOrderEntry();
    await clinicalPage.selectMedication('Penicillin V 500mg');
    
    // Verify allergy alert is displayed
    const alert = clinicalPage.page.locator('[data-testid="allergy-alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Allergy Alert: Penicillin');
    
    // Verify alert is keyboard-accessible
    await alert.press('Enter');
    await expect(clinicalPage.page.locator('[data-testid="allergy-details"]')).toBeVisible();
  });

  test('keyboard-only navigation of patient chart', async () => {
    await clinicalPage.navigateToPatient('12345');
    
    // Navigate sidebar using Tab key
    await clinicalPage.page.keyboard.press('Tab');
    await clinicalPage.page.keyboard.press('Tab');
    
    // Activate section with Enter
    await clinicalPage.page.keyboard.press('Enter');
    
    // Verify content area received focus
    await expect(clinicalPage.page.locator('main')).toBeFocused();
  });
});

// Accessibility-specific tests
test.describe('Accessibility Compliance', () => {
  test('patient chart meets WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/patient/12345');
    await page.waitForLoadState('networkidle');
    
    // Run axe-core accessibility scan
    const violations = await page.evaluate(async () => {
      const axe = await import('axe-core');
      const results = await axe.default.run(document);
      return results.violations;
    });
    
    expect(violations).toHaveLength(0);
  });

  test('color contrast meets WCAG AA standards', async ({ page }) => {
    await page.goto('/patient/12345');
    
    // Check critical alert contrast
    const alertElement = page.locator('.clinical-alert-critical');
    const contrast = await alertElement.evaluate((el) => {
      const style = window.getComputedStyle(el);
      // Use contrast checker library
      return checkContrast(style.color, style.backgroundColor);
    });
    
    expect(contrast).toBeGreaterThanOrEqual(4.5); // WCAG AA ratio
  });

  test('all interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/clinical/orders');
    
    // Tab through all interactive elements
    const tabbableElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return elements.length;
    });
    
    expect(tabbableElements).toBeGreaterThan(0);
    
    // Verify focus indicator is visible
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toHaveCSS('outline-width', '2px');
  });
});
```

#### Page Object Model for Clinical Tests

```typescript
// page-objects/ClinicalPage.ts
import { Page, Locator, expect } from '@playwright/test';

export class ClinicalPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly patientSearchInput: Locator;
  readonly searchResults: Locator;
  readonly notificationArea: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('aside[role="navigation"]');
    this.patientSearchInput = page.locator('[data-testid="patient-search"]');
    this.searchResults = page.locator('[data-testid="search-results"]');
    this.notificationArea = page.locator('[role="status"]');
  }

  async login(username: string, password: string) {
    await this.page.goto('/login');
    await this.page.fill('[data-testid="username"]', username);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="login-button"]');
    await expect(this.page).toHaveURL(/\/dashboard/);
  }

  async navigateToPatientSearch() {
    await this.sidebar.locator('text=Patients').click();
    await this.page.waitForURL(/\/patients/);
  }

  async searchPatient(query: string) {
    await this.patientSearchInput.fill(query);
    await this.patientSearchInput.press('Enter');
    await this.page.waitForResponse((resp) => 
      resp.url().includes('/fhir/Patient') && resp.status() === 200
    );
  }

  async getSearchResults(): Promise<string[]> {
    const cards = await this.searchResults.locator('.patient-card').all();
    return Promise.all(cards.map((card) => card.textContent() || ''));
  }

  async selectPatient(index: number) {
    await this.searchResults.locator('.patient-card').nth(index).click();
    await this.page.waitForURL(/\/patients\/\w+/);
  }

  async navigateToPatient(patientId: string) {
    await this.page.goto(`/patients/${patientId}`);
    await this.page.waitForLoadState('networkidle');
  }

  async clickOrderEntry() {
    await this.page.click('[data-testid="order-entry-button"]');
  }

  async selectMedication(medicationName: string) {
    await this.page.fill('[data-testid="medication-search"]', medicationName);
    await this.page.click(`text=${medicationName}`);
  }

  async enterDosage(dosage: string) {
    await this.page.fill('[data-testid="dosage-input"]', dosage);
  }

  async selectFrequency(frequency: string) {
    await this.page.selectOption('[data-testid="frequency-select"]', frequency);
  }

  async enterDuration(duration: string) {
    await this.page.fill('[data-testid="duration-input"]', duration);
  }

  async submitOrder() {
    await this.page.click('[data-testid="submit-order-button"]');
  }

  async navigateToMedications() {
    await this.page.click('text=Medications');
  }
}
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **Reliability** | 10/10 | Auto-waiting eliminates flaky tests |
| **Cross-Browser** | 10/10 | Chromium, Firefox, WebKit |
| **Debugging** | 10/10 | Traces, screenshots, videos on failure |
| **Speed** | 9/10 | Parallel execution; fast test runs |
| **Accessibility Testing** | 8/10 | Built-in axe-core integration |
| **Clinical Workflow** | 10/10 | Ideal for end-to-end clinical workflow validation |
| **API Testing** | 9/10 | Can test FHIR APIs directly |

> **Recommendation:** Playwright is the **recommended E2E testing framework** for Clinical OS. Its reliability, cross-browser support, and debugging capabilities are essential for validating clinical workflows. The Page Object Model pattern enables maintainable test suites that grow with the application.

---

### 7.3 Testing Library (MIT)

| Attribute | Detail |
|-----------|--------|
| **Repository** | [github.com/testing-library/react-testing-library](https://github.com/testing-library/react-testing-library) |
| **License** | MIT License |
| **GitHub Stars** | 19,000+ (react-testing-library) |
| **Maintainer** | Kent C. Dodds (founder) + community |
| **First Release** | 2018 |

#### Overview

Testing Library is a family of libraries for testing UI components in a way that resembles how users interact with the application. Its primary guiding principle is: "The more your tests resemble the way your software is used, the more confidence they can give you." Testing Library encourages querying DOM nodes in the same way users would -- finding form elements by label text, buttons by visible text, and links by their text content.

#### Key Features

- **User-Centric Queries:** Find elements the way users do (by text, label, role)
- **Accessibility-Aware:** Built-in selectors encourage accessible code
- **No Implementation Details:** Tests don't depend on component internals
- **Framework Agnostic:** React, Vue, Angular, Svelte, and more
- **jest-dom Matchers:** Custom matchers for DOM assertions (`toBeVisible()`, `toHaveAttribute()`)
- **User Event:** Simulate realistic user interactions (`userEvent.click()`, `userEvent.type()`)
- **Wait For:** Async utilities for testing dynamic UIs
- **Screen Object:** Global queries without rendering wrapper

#### Clinical Component Testing

```tsx
// Clinical component tests with Testing Library
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PatientCard } from './PatientCard';
import { AllergyAlert } from './AllergyAlert';
import { MedicationOrderForm } from './MedicationOrderForm';
import { VitalSignsInput } from './VitalSignsInput';

// Mock patient data
const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'test-patient-1',
  name: [{ given: ['John'], family: 'Doe', use: 'official' }],
  birthDate: '1985-03-15',
  gender: 'male',
  identifier: [{ system: 'http://hospital.example.com/mrn', value: 'MRN123456' }],
};

describe('PatientCard', () => {
  it('renders patient demographics correctly', () => {
    render(<PatientCard patient={mockPatient} />);
    
    // Query by text content (user-centric)
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText(/MRN123456/)).toBeInTheDocument();
    expect(screen.getByText(/1985-03-15/)).toBeInTheDocument();
  });

  it('calculates and displays age correctly', () => {
    render(<PatientCard patient={mockPatient} />);
    
    // Age should be approximately 40 years (as of 2026)
    expect(screen.getByText(/39|40|41 years/)).toBeInTheDocument();
  });

  it('displays unknown for missing data', () => {
    const minimalPatient = { resourceType: 'Patient', id: '2' };
    render(<PatientCard patient={minimalPatient as Patient} />);
    
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('is accessible via ARIA roles', () => {
    render(<PatientCard patient={mockPatient} />);
    
    // Screen reader users find by role
    expect(screen.getByRole('heading', { name: /John Doe/ })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', expect.stringContaining('Patient'));
  });
});

describe('AllergyAlert', () => {
  it('displays critical allergy alert prominently', () => {
    const allergies = [
      { substance: 'Penicillin', severity: 'severe', reaction: 'Anaphylaxis' },
      { substance: 'Sulfa drugs', severity: 'moderate', reaction: 'Rash' },
    ];
    
    render(<AllergyAlert allergies={allergies} />);
    
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Penicillin/)).toBeInTheDocument();
    expect(screen.getByText(/Anaphylaxis/)).toBeInTheDocument();
  });

  it('does not render when no allergies', () => {
    render(<AllergyAlert allergies={[]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is keyboard accessible', async () => {
    const allergies = [{ substance: 'Penicillin', severity: 'severe', reaction: 'Anaphylaxis' }];
    render(<AllergyAlert allergies={allergies} />);
    
    const alert = screen.getByRole('alert');
    alert.focus();
    expect(alert).toHaveFocus();
  });
});

describe('MedicationOrderForm', () => {
  const user = userEvent.setup();

  it('submits order with valid data', async () => {
    const onSubmit = vi.fn();
    render(<MedicationOrderForm onSubmit={onSubmit} patientId="123" />);
    
    // Fill form using user-centric interactions
    await user.type(screen.getByLabelText(/Medication/i), 'Amoxicillin');
    await user.type(screen.getByLabelText(/Dosage/i), '500');
    await user.selectOptions(screen.getByLabelText(/Frequency/i), 'BID');
    await user.type(screen.getByLabelText(/Duration/i), '7 days');
    
    // Submit
    await user.click(screen.getByRole('button', { name: /Submit Order/i }));
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        medication: 'Amoxicillin',
        dosage: '500',
        frequency: 'BID',
        duration: '7 days',
      }));
    });
  });

  it('displays validation errors for empty required fields', async () => {
    render(<MedicationOrderForm onSubmit={vi.fn()} patientId="123" />);
    
    // Submit without filling
    await user.click(screen.getByRole('button', { name: /Submit Order/i }));
    
    // Check for validation messages
    expect(await screen.findByText(/Medication is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Dosage is required/i)).toBeInTheDocument();
  });

  it('prevents submission when allergy exists', async () => {
    const onSubmit = vi.fn();
    const allergies = [{ substance: 'Penicillin', severity: 'severe' }];
    
    render(
      <MedicationOrderForm 
        onSubmit={onSubmit} 
        patientId="123" 
        knownAllergies={allergies}
      />
    );
    
    await user.type(screen.getByLabelText(/Medication/i), 'Penicillin');
    await user.click(screen.getByRole('button', { name: /Submit Order/i }));
    
    // Should show allergy warning
    expect(screen.getByRole('alert')).toHaveTextContent(/Allergy Warning/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('VitalSignsInput', () => {
  const user = userEvent.setup();

  it('captures vital signs with correct units', async () => {
    const onSubmit = vi.fn();
    render(<VitalSignsInput onSubmit={onSubmit} />);
    
    // Enter vital signs
    await user.type(screen.getByLabelText(/Systolic BP/i), '120');
    await user.type(screen.getByLabelText(/Diastolic BP/i), '80');
    await user.type(screen.getByLabelText(/Heart Rate/i), '72');
    await user.type(screen.getByLabelText(/Temperature/i), '37.0');
    await user.type(screen.getByLabelText(/SpO2/i), '98');
    await user.type(screen.getByLabelText(/Respiratory Rate/i), '16');
    
    await user.click(screen.getByRole('button', { name: /Record Vitals/i }));
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        systolic: 120,
        diastolic: 80,
        heartRate: 72,
        temperature: 37.0,
        spo2: 98,
        respiratoryRate: 16,
      }));
    });
  });

  it('flags critical vital signs', async () => {
    render(<VitalSignsInput onSubmit={vi.fn()} />);
    
    // Enter critical values
    await user.type(screen.getByLabelText(/Systolic BP/i), '180');
    await user.type(screen.getByLabelText(/Heart Rate/i), '140');
    await user.type(screen.getByLabelText(/SpO2/i), '88');
    
    // Critical alerts should appear
    await waitFor(() => {
      expect(screen.getByText(/Hypertensive/i)).toBeInTheDocument();
      expect(screen.getByText(/Tachycardia/i)).toBeInTheDocument();
      expect(screen.getByText(/Hypoxemia/i)).toBeInTheDocument();
    });
  });

  it('calculates BMI from height and weight', async () => {
    render(<VitalSignsInput onSubmit={vi.fn()} showBMI />);
    
    await user.type(screen.getByLabelText(/Height/i), '175');
    await user.type(screen.getByLabelText(/Weight/i), '70');
    
    await waitFor(() => {
      expect(screen.getByText(/BMI:/)).toHaveTextContent('22.9');
    });
  });
});
```

#### Accessibility Testing with Testing Library

```tsx
// Accessibility-focused component tests
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { expect, describe, it } from 'vitest';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('PatientCard has no accessibility violations', async () => {
    const { container } = render(<PatientCard patient={mockPatient} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('AllergyAlert has appropriate ARIA attributes', () => {
    render(<AllergyAlert allergies={[{ substance: 'Penicillin', severity: 'severe' }]} />);
    
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
  });

  it('MedicationOrderForm has proper label associations', () => {
    render(<MedicationOrderForm onSubmit={vi.fn()} patientId="123" />);
    
    // Every input should have an associated label
    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label).toBeInTheDocument();
    });
  });

  it('has sufficient color contrast for critical alerts', () => {
    render(<AllergyAlert allergies={[{ substance: 'Penicillin', severity: 'severe' }]} />);
    
    const alert = screen.getByRole('alert');
    const styles = window.getComputedStyle(alert);
    
    // Check that alert uses high-contrast colors
    expect(styles.backgroundColor).not.toBe('transparent');
  });
});
```

#### Clinical Suitability

| Factor | Score | Notes |
|--------|-------|-------|
| **User-Centric Testing** | 10/10 | Tests resemble real user interactions |
| **Accessibility Awareness** | 10/10 | Encourages accessible code through query patterns |
| **Maintainability** | 10/10 | Tests don't break on implementation changes |
| **Integration with Vitest** | 10/10 | Works seamlessly with Vitest |
| **jest-dom Matchers** | 9/10 | Rich assertion library for DOM testing |
| **User Event Simulation** | 9/10 | Realistic user interaction simulation |
| **Clinical Safety** | 9/10 | Query patterns ensure critical elements are accessible |

> **Recommendation:** Testing Library is the **recommended component testing library** for Clinical OS. Its user-centric approach ensures that tests validate both functionality and accessibility. Combined with Vitest for test running and Playwright for E2E, it forms a comprehensive clinical testing strategy.

---

## Section 7 Summary: Testing Framework Comparison

| Feature | Vitest | Playwright | Testing Library |
|---------|--------|------------|-----------------|
| **License** | MIT | Apache-2.0 | MIT |
| **Stars** | 14,000+ | 72,000+ | 19,000+ |
| **Test Type** | Unit/Integration | E2E | Component |
| **Speed** | Excellent | Good | N/A (needs runner) |
| **TypeScript** | Native | Native | Native |
| **Accessibility** | Via integration | axe-core built-in | User-centric queries |
| **Clinical Workflows** | Business logic | Full workflows | Component behavior |
| **Debugging** | Good | Excellent (traces) | Good |
| **Browser Testing** | Browser mode | Full cross-browser | jsdom/browser |
| **Clinical OS Fit** | Required | Required | Required |

### Recommended Testing Stack for Clinical OS

```
Vitest                    -- Unit and integration test runner
  + @testing-library/react  -- Component testing utilities
  + @testing-library/user-event  -- User interaction simulation
  + @testing-library/jest-dom    -- DOM assertions
  + jest-axe                -- Accessibility violation detection
  + jsdom                   -- Browser environment for component tests
  
Playwright                -- End-to-end clinical workflow testing
  + @playwright/test        -- Test runner and assertions
  + axe-core                -- Accessibility scanning
  
Coverage                  -- v8 or Istanbul
  -- Thresholds: 80% lines, 80% functions, 75% branches
```

---

## Section 8: Recommended Clinical OS Architecture

### 8.1 Reference Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLINICAL OPERATING SYSTEM                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────── PRESENTATION LAYER ──────────────────────┐  │
│  │                                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │  │
│  │  │  Dashboard   │  │  Patient     │  │  Clinical        │      │  │
│  │  │  (Refine)    │  │  Chart       │  │  Workflows       │      │  │
│  │  │              │  │  (React)     │  │  (React)         │      │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘      │  │
│  │                                                                  │  │
│  │  UI Components:        Navigation:          State:               │  │
│  │  - Radix UI (a11y)     - react-router-dom   - Zustand          │  │
│  │  - react-aria (a11y)   - react-pro-sidebar  - React Query      │  │
│  │  - shadcn/ui           - Radix Collapsible                       │  │
│  │  - Health Icons        - Accessible patterns                     │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────── INTEGRATION LAYER ───────────────────────┐  │
│  │                                                                  │  │
│  │  FHIR Client:        Auth:            Cache:                     │  │
│  │  - bonFHIR           - SMART on FHIR   - TanStack Query          │  │
│  │  - Custom provider   - OAuth 2.0       - Zustand persist         │  │
│  │  - OpenEMR API       - OIDC            - SessionStorage          │  │
│  │                                                                  │  │
│  │  Charts:             Notifications:    Testing:                  │  │
│  │  - Chart.js          - Radix Toast     - Vitest                  │  │
│  │  - D3.js (custom)    - Custom alerts   - Testing Library         │  │
│  │                     - ARIA live         - Playwright (E2E)       │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────── DATA LAYER ──────────────────────────────┐  │
│  │                                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │  │
│  │  │  OpenEMR     │  │  OpenMRS     │  │  Enterprise EHR  │      │  │
│  │  │  (Primary)   │  │  (Global)    │  │  (Epic/Cerner)   │      │  │
│  │  │  FHIR R4     │  │  FHIR/REST   │  │  FHIR R4 APIs    │      │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘      │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Integration Matrix

| Frontend Tool | Backend (OpenEMR) | Backend (OpenMRS) | Backend (Enterprise EHR) |
|---------------|-------------------|-------------------|--------------------------|
| **Refine** | FHIR Data Provider | REST/FHIR Adapter | SMART on FHIR |
| **React Admin** | FHIR Data Provider | REST Data Provider | FHIR Data Provider |
| **Zustand** | Client state | Client state | Client state |
| **TanStack Query** | Server cache | Server cache | Server cache |
| **Chart.js** | Observation data | Observation data | Observation data |
| **Radix UI** | N/A (frontend) | N/A (frontend) | N/A (frontend) |
| **react-aria** | N/A (frontend) | N/A (frontend) | N/A (frontend) |

### 8.3 License Compatibility Analysis

| Tool | License | Copyleft | Commercial Use | Healthcare Use | Notes |
|------|---------|----------|---------------|----------------|-------|
| **OpenEMR** | GPL-3.0 | Yes | Yes | Yes | Must distribute modifications |
| **OpenMRS** | MPL-2.0 | File-level | Yes | Yes | Only modified files must be open |
| **GNU Health** | GPL-3.0 | Yes | Yes | Yes | Must distribute modifications |
| **LibreHealth** | MPL-2.0 | File-level | Yes | Yes | Compatible with proprietary frontends |
| **React Admin** | MIT | No | Yes | Yes | Fully permissive |
| **Refine** | MIT | No | Yes | Yes | Fully permissive |
| **Tabler** | MIT | No | Yes | Yes | Fully permissive |
| **AdminJS** | MIT | No | Yes | Yes | Fully permissive |
| **Appsmith** | Apache-2.0 | No | Yes | Yes | Patent protection |
| **Zustand** | MIT | No | Yes | Yes | Fully permissive |
| **Jotai** | MIT | No | Yes | Yes | Fully permissive |
| **Redux Toolkit** | MIT | No | Yes | Yes | Fully permissive |
| **Chart.js** | MIT | No | Yes | Yes | Fully permissive |
| **D3.js** | ISC | No | Yes | Yes | Fully permissive |
| **Radix UI** | MIT | No | Yes | Yes | Fully permissive |
| **react-aria** | Apache-2.0 | No | Yes | Yes | Patent protection |
| **Vitest** | MIT | No | Yes | Yes | Fully permissive |
| **Playwright** | Apache-2.0 | No | Yes | Yes | Patent protection |
| **Testing Library** | MIT | No | Yes | Yes | Fully permissive |
| **Health Icons** | CC0 | No | Yes | Yes | Public domain |
| **bonFHIR** | MIT | No | Yes | Yes | Fully permissive |

### 8.4 Healthcare Safety UX Considerations

#### Critical Design Patterns

| Pattern | Implementation | Rationale |
|---------|---------------|-----------|
| **Confirmation Dialogs** | Radix Dialog + react-aria | Prevent accidental actions (discharge, delete) |
| **Undo Capability** | Zustand state management | Allow reversal of recent actions |
| **High-Contrast Alerts** | Custom CSS + ARIA live | Ensure visibility of critical alerts |
| **Error Prevention** | Form validation + disabling | Prevent invalid data entry |
| **Audit Logging** | Backend integration | Track all clinical actions |
| **Read-Back Pattern** | Display order summary | Require confirmation of entered data |
| **Timeout Warnings** | Custom hook + Radix Dialog | Prevent session timeout during clinical work |
| **Context Preservation** | Zustand persist | Maintain patient context across views |
| **Keyboard Shortcuts** | react-aria useKeyboard | Enable rapid navigation for power users |
| **Offline Indicators** | Custom hook | Warn when connectivity is lost |

#### Safety-Critical Color System

```css
/* Clinical OS safety color system */
:root {
  /* Critical alerts -- immediate action required */
  --clinical-critical: #DC2626;
  --clinical-critical-bg: #FEE2E2;
  --clinical-critical-border: #EF4444;
  
  /* Warning -- attention needed soon */
  --clinical-warning: #F59E0B;
  --clinical-warning-bg: #FEF3C7;
  --clinical-warning-border: #FBBF24;
  
  /* Caution -- be aware */
  --clinical-caution: #F97316;
  --clinical-caution-bg: #FFF7ED;
  --clinical-caution-border: #FB923C;
  
  /* Success -- action completed */
  --clinical-success: #059669;
  --clinical-success-bg: #D1FAE5;
  --clinical-success-border: #34D399;
  
  /* Info -- general information */
  --clinical-info: #2563EB;
  --clinical-info-bg: #DBEAFE;
  --clinical-info-border: #60A5FA;
  
  /* Normal/healthy -- within range */
  --clinical-normal: #10B981;
  
  /* Allergy -- specific alert color */
  --clinical-allergy: #7C3AED;
  --clinical-allergy-bg: #F3E8FF;
  
  /* High contrast mode support */
  --clinical-focus-ring: 0 0 0 3px rgba(37, 99, 235, 0.5);
}

/* High contrast mode */
@media (prefers-contrast: high) {
  :root {
    --clinical-critical: #FF0000;
    --clinical-success: #008000;
    --clinical-info: #0000FF;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

---

## Appendix A: Quick Comparison Tables

### A.1 EHR Platforms

| Platform | License | Stars | Language | FHIR | Status |
|----------|---------|-------|----------|------|--------|
| OpenEMR | GPL-3.0 | 8,500+ | PHP/JS | R4 (30+) | Active |
| OpenMRS | MPL-2.0 | 1,200+ | Java | Partial | Active |
| GNU Health | GPL-3.0 | 500+ | Python | Limited | Active |
| HospitalRun | MIT | 6,500+ | JS/TS | None | Archived |
| LibreHealth | MPL-2.0 | 800+ | PHP | Partial | Moderate |

### A.2 Dashboard Frameworks

| Framework | License | Stars | Type | FHIR Ready |
|-----------|---------|-------|------|------------|
| Refine | MIT | 34,100+ | Headless | Yes |
| Tabler | MIT | 40,800+ | Template | With adapter |
| Appsmith | Apache-2.0 | 34,000+ | Low-code | Via REST |
| React Admin | MIT | 26,500+ | Component | Yes |
| AdminJS | MIT | 8,900+ | Auto-gen | Via adapter |

### A.3 State Management

| Library | License | Stars | Size | Paradigm |
|---------|---------|-------|------|----------|
| Zustand | MIT | 47,000+ | 1.1 KB | Flux store |
| Jotai | MIT | 22,000+ | 5 KB | Atomic |
| Redux Toolkit | MIT | 11,000+ | 20 KB | Flux slices |

### A.4 Testing

| Framework | License | Stars | Type | Speed |
|-----------|---------|-------|------|-------|
| Playwright | Apache-2.0 | 72,000+ | E2E | Good |
| Vitest | MIT | 14,000+ | Unit | Excellent |
| Testing Library | MIT | 19,000+ | Component | N/A |

---

## Appendix B: GitHub Star Counts & Activity

| Repository | Stars | License | Activity |
|------------|-------|---------|----------|
| d3/d3 | 108,000+ | ISC | Active |
| react-router | 54,000+ | MIT | Very Active |
| pmndrs/zustand | 47,000+ | MIT | Very Active |
| chartjs/Chart.js | 64,000+ | MIT | Active |
| microsoft/playwright | 72,000+ | Apache-2.0 | Very Active |
| refinedev/refine | 34,100+ | MIT | Very Active |
| appsmithorg/appsmith | 34,000+ | Apache-2.0 | Very Active |
| marmelab/react-admin | 26,500+ | MIT | Very Active |
| pmndrs/jotai | 22,000+ | MIT | Active |
| adobe/react-spectrum | 14,000+ | Apache-2.0 | Active |
| vitest-dev/vitest | 14,000+ | MIT | Very Active |
| tabler/tabler | 40,800+ | MIT | Active |
| radix-ui/primitives | 18,700+ | MIT | Very Active |
| testing-library/react-testing-library | 19,000+ | MIT | Active |
| reduxjs/redux-toolkit | 11,000+ | MIT | Active |
| SoftwareBrothers/adminjs | 8,900+ | MIT | Active |
| openemr/openemr | 8,500+ | GPL-3.0 | Active |
| molefrog/wouter | 6,000+ | ISC | Active |
| openmrs/openmrs-core | 1,200+ | MPL-2.0 | Active |
| resolvetosavelives/healthicons | 1,200+ | CC0 | Active |
| bonfhir/bonfhir | 250+ | MIT | Active |

---

## Appendix C: Clinical Suitability Scorecard

### Overall Clinical OS Suitability

| Category | Top Choice | Score | Alternative |
|----------|-----------|-------|-------------|
| **EHR Backend** | OpenEMR | 9/10 | OpenMRS |
| **Dashboard Framework** | Refine | 9/10 | React Admin |
| **Router** | react-router-dom | 9/10 | wouter (widgets) |
| **Sidebar** | react-pro-sidebar + Radix | 8/10 | Custom |
| **FHIR Components** | bonFHIR | 8/10 | Custom |
| **Icons** | Health Icons | 10/10 | Font Awesome |
| **Charts** | Chart.js | 9/10 | D3.js (custom) |
| **State Management** | Zustand | 9/10 | Redux Toolkit (large) |
| **Accessibility** | react-aria + Radix | 10/10 | -- |
| **Testing (Unit)** | Vitest + Testing Library | 10/10 | -- |
| **Testing (E2E)** | Playwright | 10/10 | -- |
| **Admin Panel** | AdminJS | 7/10 | React Admin |
| **Low-Code Ops** | Appsmith | 7/10 | -- |

---

## Appendix D: Integration Path Recommendations

### Path A: Full-Stack Clinical OS (Recommended)

```
Phase 1 (Weeks 1-4): Foundation
  - OpenEMR deployment + FHIR API configuration
  - Refine app scaffolding + FHIR data provider
  - react-router-dom + react-pro-sidebar
  - Zustand + TanStack Query setup
  - Radix UI + react-aria integration
  - Vitest + Testing Library + Playwright setup

Phase 2 (Weeks 5-8): Core Clinical Modules
  - Patient search and chart
  - Encounter management
  - Order entry (medications, labs)
  - Vital signs capture
  - Allergy and medication review

Phase 3 (Weeks 9-12): Advanced Features
  - Clinical decision support alerts
  - Lab result visualization (Chart.js)
  - Scheduling integration
  - Provider dashboard
  - Administrative tools (AdminJS)

Phase 4 (Weeks 13-16): Polish & Compliance
  - Accessibility audit (WCAG 2.1 AA)
  - Performance optimization
  - Security hardening
  - User acceptance testing
  - Documentation
```

### Path B: EHR-Embedded Clinical Widget (SMART on FHIR)

```
Phase 1 (Weeks 1-2): Setup
  - SMART on FHIR React Template
  - React + TypeScript + Vite
  - Zustand for local state
  - Chart.js for visualizations

Phase 2 (Weeks 3-4): Widget Development
  - Patient context from EHR
  - Clinical data display
  - User interactions
  - EHR write-back (if authorized)

Phase 3 (Weeks 5-6): Integration
  - SMART launch testing
  - EHR vendor compatibility (Epic, Cerner)
  - Security review
  - Deployment
```

### Path C: Clinical Analytics Dashboard

```
Phase 1: Data Layer
  - OpenEMR FHIR API or direct database
  - Appsmith or Refine for dashboard
  - Chart.js + D3.js for visualizations

Phase 2: Dashboard Development
  - Population health metrics
  - Quality indicators
  - Provider performance
  - Financial analytics

Phase 3: Deployment
  - Self-hosted Appsmith or custom deploy
  - Role-based access
  - Scheduled reports
```

---

## References

### EHR/Clinical Platforms

1. OpenEMR Project. "OpenEMR - Open Source Electronic Health Records." [https://github.com/openemr/openemr](https://github.com/openemr/openemr)
2. OpenMRS Inc. "OpenMRS - Open Medical Record System." [https://github.com/openmrs/openmrs-core](https://github.com/openmrs/openmrs-core)
3. GNU Solidario. "GNU Health - Hospital Information System." [https://www.gnuhealth.org](https://www.gnuhealth.org)
4. HospitalRun Project (Archived). "HospitalRun - Offline-first EMR." [https://github.com/HospitalRun](https://github.com/HospitalRun)
5. LibreHealth Project. "LibreHealth EHR." [https://github.com/LibreHealthIO](https://github.com/LibreHealthIO)

### Dashboard Frameworks

6. Marmelab. "React Admin - A Frontend Framework for B2B Apps." [https://github.com/marmelab/react-admin](https://github.com/marmelab/react-admin)
7. Refine Development Inc. "Refine - React Framework for Internal Tools." [https://github.com/refinedev/refine](https://github.com/refinedev/refine)
8. Tabler. "Tabler - Free and Open-Source HTML Dashboard UI Kit." [https://github.com/tabler/tabler](https://github.com/tabler/tabler)
9. RST Software. "AdminJS - Admin Panel for Node.js." [https://github.com/SoftwareBrothers/adminjs](https://github.com/SoftwareBrothers/adminjs)
10. Appsmith Inc. "Appsmith - Platform to Build Admin Panels." [https://github.com/appsmithorg/appsmith](https://github.com/appsmithorg/appsmith)

### Navigation

11. Remix Team. "React Router - Declarative Routing for React." [https://github.com/remix-run/react-router](https://github.com/remix-run/react-router)
12. Ryan Florence. "Reach UI - Accessible React Components." [https://github.com/reach/reach-ui](https://github.com/reach/reach-ui)
13. Alexey Taktarov. "wouter - Minimalist-friendly Routing for React." [https://github.com/molefrog/wouter](https://github.com/molefrog/wouter)

### Healthcare UI

14. bonFHIR Team. "bonFHIR - FHIR React Components." [https://github.com/bonfhir/bonfhir](https://github.com/bonfhir/bonfhir)
15. Health Intellect. "fhir-ui - React Components for FHIR." [https://github.com/healthintellect/fhir-ui](https://github.com/healthintellect/fhir-ui)
16. Resolve to Save Lives. "Health Icons - Free, Open Source Health Icons." [https://github.com/resolvetosavelives/healthicons](https://github.com/resolvetosavelives/healthicons)
17. Chart.js Contributors. "Chart.js - Simple yet Flexible JavaScript Charting." [https://github.com/chartjs/Chart.js](https://github.com/chartjs/Chart.js)
18. Mike Bostock. "D3.js - Data-Driven Documents." [https://github.com/d3/d3](https://github.com/d3/d3)

### State Management

19. Poimandres. "Zustand - Small, Fast, and Scalable State Management." [https://github.com/pmndrs/zustand](https://github.com/pmndrs/zustand)
20. Poimandres. "Jotai - Primitive and Flexible State Management for React." [https://github.com/pmndrs/jotai](https://github.com/pmndrs/jotai)
21. Redux Team. "Redux Toolkit - Official, Opinionated, Batteries-Included Toolset." [https://github.com/reduxjs/redux-toolkit](https://github.com/reduxjs/redux-toolkit)

### Accessibility

22. WorkOS. "Radix UI Primitives - Accessible UI Component Library." [https://github.com/radix-ui/primitives](https://github.com/radix-ui/primitives)
23. Adobe. "React Spectrum - Accessible, Adaptive, Robust User Experiences." [https://github.com/adobe/react-spectrum](https://github.com/adobe/react-spectrum)

### Testing

24. VoidZero. "Vitest - Next Generation Testing Framework." [https://github.com/vitest-dev/vitest](https://github.com/vitest-dev/vitest)
25. Microsoft. "Playwright - Reliable End-to-End Testing." [https://github.com/microsoft/playwright](https://github.com/microsoft/playwright)
26. Kent C. Dodds. "Testing Library - Simple and Complete Testing Utilities." [https://github.com/testing-library/react-testing-library](https://github.com/testing-library/react-testing-library)

### Standards & Guidelines

27. HL7 International. "FHIR - Fast Healthcare Interoperability Resources." [https://hl7.org/fhir/](https://hl7.org/fhir/)
28. W3C. "WAI-ARIA Authoring Practices." [https://www.w3.org/WAI/ARIA/apg/](https://www.w3.org/WAI/ARIA/apg/)
29. W3C. "Web Content Accessibility Guidelines (WCAG) 2.1." [https://www.w3.org/WAI/WCAG21/quickref/](https://www.w3.org/WAI/WCAG21/quickref/)
30. SMART Health IT. "SMART on FHIR." [https://smarthealthit.org/](https://smarthealthit.org/)
31. U.S. Department of Health & Human Services. "HIPAA Security Rule." [https://www.hhs.gov/hipaa/for-professionals/security/index.html](https://www.hhs.gov/hipaa/for-professionals/security/index.html)

---

> **Document End.**
>
> This research report was compiled from publicly available GitHub repositories, documentation, and community resources as of January 2026. All GitHub star counts and activity metrics are approximate and subject to change. License information should be verified independently for compliance decisions.
>
> **License:** This research report is provided under CC BY 4.0 for unrestricted use, modification, and distribution with attribution.
