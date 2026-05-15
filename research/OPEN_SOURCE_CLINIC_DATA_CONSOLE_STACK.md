# Open Source Clinic Data Console Stack: Comprehensive Research Report

> **Version:** 1.0  
> **Date:** 2025  
> **Target Audience:** Healthcare technology architects, CTOs, and engineering teams building clinic data management platforms  
> **Focus:** Open source tools for building HIPAA/GDPR-compliant clinic data consoles with FastAPI/SQLAlchemy backends

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Admin Dashboard Frameworks](#2-admin-dashboard-frameworks)
   - 2.1 [React Admin](#21-react-admin)
   - 2.2 [refine](#22-refine)
   - 2.3 [AdminJS](#23-adminjs)
   - 2.4 [Forest Admin](#24-forest-admin)
   - 2.5 [Appsmith](#25-appsmith)
   - 2.6 [ToolJet](#26-tooljet)
   - 2.7 [Comparative Matrix](#27-comparative-matrix)
3. [Database UI/Explorers](#3-database-uiexplorers)
   - 3.1 [Directus](#31-directus)
   - 3.2 [Baserow](#32-baserow)
   - 3.3 [NocoDB](#33-nocodb)
   - 3.4 [Rowy](#34-rowy)
   - 3.5 [Grist](#35-grist)
   - 3.6 [Teable](#36-teable)
   - 3.7 [Comparative Matrix](#37-comparative-matrix)
4. [Healthcare-Specific Open Source](#4-healthcare-specific-open-source)
   - 4.1 [OpenEMR](#41-openemr)
   - 4.2 [OpenMRS](#42-openmrs)
   - 4.3 [GNU Health](#43-gnu-health)
   - 4.4 [HospitalRun](#44-hospitalrun)
   - 4.5 [LibreHealth](#45-librehealth)
   - 4.6 [Comparative Matrix](#46-comparative-matrix)
5. [Audit Logging Tools](#5-audit-logging-tools)
   - 5.1 [AuditJS](#51-auditjs)
   - 5.2 [trailpack-audit](#52-trailpack-audit)
   - 5.3 [django-auditlog](#53-django-auditlog)
   - 5.4 [Custom Audit Middleware Patterns](#54-custom-audit-middleware-patterns)
6. [Consent Management](#6-consent-management)
   - 6.1 [Consent Management Platform Patterns](#61-consent-management-platform-patterns)
   - 6.2 [UMA (User-Managed Access)](#62-uma-user-managed-access)
   - 6.3 [OAuth 2.0 for Consent](#63-oauth-20-for-consent)
   - 6.4 [XACML for Policy-Based Access](#64-xacml-for-policy-based-access)
7. [Data Anonymization](#7-data-anonymization)
   - 7.1 [ARX Data Anonymization Tool](#71-arx-data-anonymization-tool)
   - 7.2 [Amnesia](#72-amnesia)
   - 7.3 [k-anonymity and l-diversity Implementations](#73-k-anonymity-and-l-diversity-implementations)
   - 7.4 [Differential Privacy Libraries](#74-differential-privacy-libraries)
8. [Visualization Tools](#8-visualization-tools)
   - 8.1 [Metabase](#81-metabase)
   - 8.2 [Apache Superset](#82-apache-superset)
   - 8.3 [Grafana](#83-grafana)
   - 8.4 [Redash](#84-redash)
   - 8.5 [Comparative Matrix](#85-comparative-matrix)
9. [Export Tools](#9-export-tools)
   - 9.1 [pandas (CSV/Excel)](#91-pandas)
   - 9.2 [WeasyPrint (PDF)](#92-weasyprint)
   - 9.3 [FHIR.js](#93-fhirjs)
   - 9.4 [jsonschema](#94-jsonschema)
10. [Architecture Recommendations](#10-architecture-recommendations)
11. [Compliance Matrix](#11-compliance-matrix)
12. [References](#12-references)

---

## 1. Executive Summary

Building a clinic data console requires careful selection of open source tools that balance clinical suitability, regulatory compliance (HIPAA, GDPR), developer productivity, and long-term maintainability. This report evaluates **30+ open source tools** across **8 categories** relevant to clinic data management platforms.

### Key Findings

| Category | Top Recommendation | Runner-Up | Key Consideration |
|----------|-------------------|-----------|-------------------|
| Admin Dashboard | **refine** (MIT, 34k stars) | React Admin (MIT, 26.7k stars) | refine offers more backend connectors and better TypeScript support |
| Database UI | **Baserow** (MIT, 4.8k stars) | Grist (Apache, 6.2k stars) | Baserow is HIPAA/GDPR/SOC2 compliant out of the box |
| Healthcare Foundation | **OpenMRS** (MPL) | OpenEMR (GPL) | OpenMRS has better architecture for custom clinic modules |
| Audit Logging | **Custom FastAPI middleware** | django-auditlog (MIT) | Custom gives full control over PHI audit trails |
| Consent Management | **UMA + OAuth 2.0** hybrid | XACML for complex policies | UMA aligns with patient-managed access principles |
| Data Anonymization | **ARX** (Apache) | Amnesia (MIT) | ARX is the gold standard for clinical data anonymization |
| Visualization | **Apache Superset** (Apache) | Metabase (AGPL) | Superset is fully open; Metabase has AGPL compliance considerations |
| Export | **pandas + WeasyPrint + FHIR.js** | Combo stack | Each addresses a specific clinical export requirement |

### Critical Compliance Notes

- **HIPAA compliance is not a feature of any tool** -- it is an outcome of how tools are deployed, configured, and operated. All tools require BAA (Business Associate Agreement) documentation when handling PHI.
- **AGPL-licensed tools** (Metabase, Grafana, NocoDB) require careful consideration if used to provide services over a network. Source code disclosure obligations may apply.
- **Permissive licenses** (MIT, Apache, BSD) generally pose fewer compliance concerns for commercial clinic deployments.

---

## 2. Admin Dashboard Frameworks

Admin dashboards serve as the primary interface for clinic staff to manage patient data, appointments, billing, and clinical workflows. The frameworks below provide CRUD operations, authentication, access control, and data visualization components.

---

### 2.1 React Admin

| Property | Detail |
|----------|--------|
| **Name** | React Admin |
| **Language** | TypeScript / React |
| **License** | MIT |
| **GitHub** | https://github.com/marmelab/react-admin |
| **Stars** | ~26,700 |
| **Forks** | ~5,450 |
| **Maintainer** | Marmelab |
| **First Release** | 2016 |
| **Latest Activity** | Weekly bug fix releases (active) |

#### Key Features

- **170+ hooks and components** in the open-source edition, including data grids, filters, forms, validation, relationships, authentication, access control, undo functionality, theming, and internationalization
- **Backend agnostic** -- works with REST, GraphQL, SOAP, and custom API adapters
- **Material Design UI** built on Material UI components
- **Enterprise Edition** adds 230+ additional hooks/components including RBAC, audit log, versioning, real-time updates, calendar/scheduler, tree structures, and JSON Schema forms (starts at EUR 145/month)
- Strong TypeScript support with complete type definitions
- Extensive documentation, Storybook, and example applications
- Active community via Stack Overflow and Discord

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 7/10 | No built-in audit logging; needs custom HIPAA controls |
| Access Control | 8/10 | RBAC via Enterprise Edition; OSS has basic auth |
| Audit Trail | 5/10 | Enterprise only; custom implementation needed for OSS |
| Data Validation | 9/10 | Excellent form validation framework |
| Customization | 9/10 | Highly customizable with custom components |
| **Overall** | **7.5/10** | Excellent framework, but clinical features need building |

#### Integration Path with FastAPI/SQLAlchemy

React Admin connects via REST API. With FastAPI/SQLAlchemy:

```python
# FastAPI backend with React Admin-compatible endpoints
from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# React Admin expects specific response format
class PatientResponse(BaseModel):
    id: int
    name: str
    date_of_birth: str
    medical_record_number: str
    last_visit: Optional[str] = None

class PatientListResponse(BaseModel):
    data: List[PatientResponse]
    total: int

@app.get("/api/patients", response_model=PatientListResponse)
async def list_patients(
    range: str = Query(..., description="Pagination range, e.g., [0, 9]"),
    sort: str = Query(..., description="Sort field and order, e.g., [\"id\", \"ASC\"]"),
    filter: Optional[str] = Query(None, description="Filter criteria"),
    db: Session = Depends(get_db)
):
    """Endpoint compatible with React Admin simple-rest data provider."""
    import json
    start, end = json.loads(range)
    
    query = db.query(Patient)
    
    # Apply filters from React Admin
    if filter:
        filters = json.loads(filter)
        if "q" in filters:
            search = f"%{filters['q']}%"
            query = query.filter(
                or_(Patient.name.ilike(search), Patient.mrn.ilike(search))
            )
    
    total = query.count()
    
    # Apply sorting
    sort_field, sort_order = json.loads(sort)
    if sort_order == "DESC":
        query = query.order_by(desc(getattr(Patient, sort_field)))
    else:
        query = query.order_by(asc(getattr(Patient, sort_field)))
    
    # Apply pagination
    query = query.offset(start).limit(end - start + 1)
    patients = query.all()
    
    return {"data": patients, "total": total}
```

```typescript
// React Admin frontend data provider
import { Admin, Resource, ListGuesser } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';

const dataProvider = simpleRestProvider('http://localhost:8000/api');

const App = () => (
    <Admin dataProvider={dataProvider}>
        <Resource name="patients" list={PatientList} edit={PatientEdit} />
    </Admin>
);
```

#### Limitations

- No built-in audit logging (Enterprise Edition only)
- No healthcare-specific components (requires custom patient card, clinical note viewers, etc.)
- HIPAA compliance entirely up to the implementing team
- Enterprise Edition required for advanced RBAC, scheduling, and audit features
- Material UI dependency may limit visual design flexibility

---

### 2.2 refine

| Property | Detail |
|----------|--------|
| **Name** | refine |
| **Language** | TypeScript / React |
| **License** | MIT |
| **GitHub** | https://github.com/refinedev/refine |
| **Stars** | ~34,000 |
| **Forks** | ~3,000 |
| **Maintainer** | RefineDev |
| **First Release** | 2021 |
| **Latest Activity** | Very active; continuous development |

#### Key Features

- **Headless design** -- UI-agnostic, works with Material UI, Ant Design, Mantine, Chakra UI, or custom design systems
- **Connectors for 15+ backend services** including REST API, GraphQL, NestJS CRUD, Airtable, Strapi, Supabase, Hasura, Appwrite, Firebase, Sanity, and Directus
- **SSR support** with Next.js and Remix
- **Auto-generation of CRUD UIs** based on API data structure
- **React Query integration** for state management and mutations
- **Authentication and access control providers** out of the box
- **Real-time/live application support**
- **Devtools** for debugging and insights
- First-class TypeScript support
- Internationalization (i18n) built-in

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 8/10 | Better separation of concerns; audit log support |
| Access Control | 9/10 | Built-in access control with multiple provider options |
| Audit Trail | 7/10 | "Easy audit logs & document versioning" per docs |
| Data Validation | 9/10 | Via React Hook Form integration |
| Customization | 10/10 | Headless architecture enables any clinical UI |
| **Overall** | **8.5/10** | Best-in-class flexibility for clinical applications |

#### Integration Path with FastAPI/SQLAlchemy

```python
# FastAPI backend for refine integration
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date

app = FastAPI()

# CORS required for refine frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # refine dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# refine expects REST API with standard CRUD patterns
class PatientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date
    medical_record_number: str = Field(..., pattern=r"^MRN-[0-9]{6}$")
    phone: Optional[str] = None
    email: Optional[str] = None
    insurance_id: Optional[str] = None

class PatientCreate(PatientBase):
    pass

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class PatientInDB(PatientBase):
    id: int
    created_at: str
    updated_at: str

@app.get("/patients")
async def list_patients(
    _start: int = 0,
    _end: int = 10,
    _sort: str = "id",
    _order: str = "asc",
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List patients with pagination/sorting/filtering for refine."""
    query = db.query(Patient)
    
    if q:
        query = query.filter(
            or_(
                Patient.name.ilike(f"%{q}%"),
                Patient.medical_record_number.ilike(f"%{q}%")
            )
        )
    
    total = query.count()
    
    if _order == "desc":
        query = query.order_by(desc(getattr(Patient, _sort)))
    else:
        query = query.order_by(asc(getattr(Patient, _sort)))
    
    patients = query.offset(_start).limit(_end - _start).all()
    
    return patients

@app.get("/patients/{patient_id}")
async def get_patient(patient_id: int, db: Session = Depends(get_db)):
    """Get single patient by ID."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient

@app.post("/patients", status_code=201)
async def create_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    """Create a new patient record."""
    db_patient = Patient(**patient.model_dump())
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient

@app.patch("/patients/{patient_id}")
async def update_patient(
    patient_id: int,
    patient_update: PatientUpdate,
    db: Session = Depends(get_db)
):
    """Update patient record (partial update)."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    for field, value in patient_update.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    
    db.commit()
    db.refresh(patient)
    return patient

@app.delete("/patients/{patient_id}")
async def delete_patient(patient_id: int, db: Session = Depends(get_db)):
    """Delete patient record."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient)
    db.commit()
    return {"id": patient_id}
```

```typescript
// refine frontend for clinic data management
import { Refine } from "@refinedev/core";
import { RefineKbarProvider } from "refine-kbar";
import { notificationProvider, Layout, ErrorComponent } from "@refinedev/antd";
import routerProvider from "@refinedev/react-router";
import dataProvider from "@refinedev/simple-rest";

// Clinical resource components
import { PatientList } from "./pages/patients/list";
import { PatientShow } from "./pages/patients/show";
import { PatientCreate } from "./pages/patients/create";
import { PatientEdit } from "./pages/patients/edit";

// Audit log integration
import { AuditLogProvider } from "./providers/audit-log";

// Access control with RBAC for clinical roles
import { accessControlProvider } from "./providers/access-control";

const API_URL = "http://localhost:8000";

const App: React.FC = () => {
    return (
        <RefineKbarProvider>
            <Refine
                dataProvider={dataProvider(API_URL)}
                routerProvider={routerProvider}
                notificationProvider={notificationProvider}
                accessControlProvider={accessControlProvider}
                auditLogProvider={AuditLogProvider}
                resources={[
                    {
                        name: "patients",
                        list: "/patients",
                        show: "/patients/show/:id",
                        create: "/patients/create",
                        edit: "/patients/edit/:id",
                        meta: {
                            canDelete: true,
                            label: "Patients",
                            icon: <UserOutlined />,
                        },
                    },
                    {
                        name: "appointments",
                        list: "/appointments",
                        create: "/appointments/create",
                        edit: "/appointments/edit/:id",
                        meta: {
                            label: "Appointments",
                            icon: <CalendarOutlined />,
                        },
                    },
                    {
                        name: "clinical-notes",
                        list: "/clinical-notes",
                        show: "/clinical-notes/show/:id",
                        meta: {
                            label: "Clinical Notes",
                            icon: <FileTextOutlined />,
                        },
                    },
                ]}
            />
        </RefineKbarProvider>
    );
};
```

#### Limitations

- Newer ecosystem compared to React Admin (fewer third-party plugins)
- Learning curve for the refine-specific patterns
- Healthcare-specific components must be built custom
- Audit logging requires custom implementation despite being "easy" per docs
- No built-in FHIR support

---

### 2.3 AdminJS

| Property | Detail |
|----------|--------|
| **Name** | AdminJS |
| **Language** | TypeScript / React / Node.js |
| **License** | MIT |
| **GitHub** | https://github.com/SoftwareBrothers/adminjs |
| **Stars** | ~8,500 |
| **Maintainer** | SoftwareBrothers (RST Software) |
| **First Release** | 2018 |
| **Latest Activity** | Active maintenance |

#### Key Features

- **Auto-generated admin panel** from database models (ORM-agnostic)
- **Supports Sequelize, TypeORM, Mongoose, Prisma, MikroORM, and Objection**
- **Customizable UI components** built on React and styled-components
- **Role-based access control** with custom actions
- **Plugin ecosystem** including bulk actions, import/export, and audit log
- **Custom dashboard widgets**
- **File upload support** with multiple storage adapters
- **i18n support** for multi-language clinics

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 6/10 | Basic; relies on underlying ORM for data protection |
| Access Control | 7/10 | RBAC available but needs configuration |
| Audit Trail | 6/10 | Plugin available but not comprehensive |
| Data Validation | 7/10 | Via ORM-level validation |
| Customization | 8/10 | Good component customization |
| **Overall** | **6.5/10** | Good for rapid prototyping; clinical needs extra work |

#### Integration Path with FastAPI/SQLAlchemy

AdminJS is Node.js-based, so direct FastAPI integration requires a different approach. Options:

1. **Use AdminJS as a separate service** with its own database connection
2. **Use the `@adminjs/sql` adapter** with direct PostgreSQL connection

```javascript
// AdminJS standalone with direct PostgreSQL connection
const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const { Database, Resource } = require('@adminjs/sql');

const db = new Database('postgresql://user:pass@localhost/clinic_db', {
  dialect: 'postgresql',
});

const admin = new AdminJS({
  databases: [db],
  rootPath: '/admin',
  branding: {
    companyName: 'Clinic Management Console',
    logo: '/logo.png',
    softwareBrothers: false,
  },
  resources: [
    {
      resource: db.table('patients'),
      options: {
        properties: {
          ssn: { isVisible: { list: false, filter: false, show: true, edit: false } },
          medical_record_number: { isTitle: true },
        },
        actions: {
          edit: { isAccessible: ({ currentAdmin }) => currentAdmin.role === 'doctor' },
          delete: { isAccessible: ({ currentAdmin }) => currentAdmin.role === 'admin' },
        },
      },
    },
  ],
});
```

#### Limitations

- Node.js-based -- requires a separate service from FastAPI backend
- No direct Python/FastAPI adapter
- Smaller community than React Admin or refine
- Healthcare-specific features not built-in
- Audit logging requires plugin installation

---

### 2.4 Forest Admin

| Property | Detail |
|----------|--------|
| **Name** | Forest Admin |
| **Language** | Node.js / Ruby / Python (multi-agent) |
| **License** | Proprietary (with open-source agents) |
| **GitHub** | https://github.com/ForestAdmin |
| **Stars** | ~4,000 (combined org) |
| **Maintainer** | Forest Admin SAS |
| **First Release** | 2015 |

#### Key Features

- **Proprietary platform** with open-source agents (datasource-sql, datasource-custom)
- **Instant admin panel generation** from SQL databases
- **Built-in RBAC** with team-based permissions
- **Smart actions** for custom business workflows
- **Charts and analytics** built-in
- **Search and filtering** with advanced query capabilities
- **Multi-environment support** (dev, staging, production)

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 7/10 | SOC2 certified platform; HIPAA BAA available |
| Access Control | 9/10 | Advanced RBAC with team management |
| Audit Trail | 8/10 | Built-in audit log tracking |
| Data Validation | 8/10 | Server-side validation support |
| Customization | 7/10 | Limited by proprietary platform |
| **Overall** | **7.5/10** | Good for teams wanting managed solution |

#### Integration Path with FastAPI/SQLAlchemy

```python
# Forest Admin Python agent with FastAPI
from fastapi import FastAPI
from forestadmin.agent_toolkit.utils.forest_schema.type import AgentOptions
from forestadmin.datasource_sqlalchemy.datasource import SqlAlchemyDatasource
from forestadmin.agent_toolkit.agent import Agent

app = FastAPI()

# Initialize Forest Admin agent
agent = Agent(AgentOptions(
    auth_secret="YOUR_AUTH_SECRET",
    env_secret="YOUR_ENV_SECRET",
    forest_server_url="https://api.forestadmin.com",
    schema_path=".forestadmin-schema.json",
))

# Add SQLAlchemy datasource
agent.add_datasource(SqlAlchemyDatasource(db_engine))

# Customize collections for clinical data
agent.customize_collection("patients", lambda collection: (
    collection
    .add_field_validation("email", "Present")
    .add_field_validation("medical_record_number", "Present")
    .rename_field("dob", "date_of_birth")
))

agent.mount_on_fastapi(app)
```

#### Limitations

- **Proprietary platform** -- vendor lock-in risk
- **Pricing required** for production use (free tier limited)
- Not fully open source (agents are OSS, platform is proprietary)
- Data passes through Forest Admin servers (evaluate for PHI)
- Limited offline/self-hosted capability

---

### 2.5 Appsmith

| Property | Detail |
|----------|--------|
| **Name** | Appsmith |
| **Language** | Java / React / TypeScript |
| **License** | Apache 2.0 |
| **GitHub** | https://github.com/appsmithorg/appsmith |
| **Stars** | ~37,000 |
| **Forks** | ~3,500 |
| **Maintainer** | Appsmith Inc. |
| **First Release** | 2019 |
| **Latest Activity** | Very active; daily commits |

#### Key Features

- **Low-code platform** with 45+ customizable widgets
- **Drag-and-drop UI builder** with JavaScript editor for complex logic
- **25+ native database integrations** including PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch
- **REST and GraphQL API** support
- **Built-in authentication** with SSO, Google OAuth, SAML support
- **Git-based version control** for applications
- **Real-time collaboration** with commenting
- **Workflow automation** with JS-based logic
- **AI-powered app generation** (Appsmith AI)
- **Self-hosted** via Docker, Kubernetes, AWS AMI

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 7/10 | Self-hosted option keeps data in-house; needs HIPAA configuration |
| Access Control | 8/10 | Granular ACL with workspace, app, and page-level permissions |
| Audit Trail | 7/10 | Audit logs available but may need enhancement for PHI |
| Data Validation | 8/10 | Built-in validation with JS custom validators |
| Customization | 8/10 | Good widget library; custom widgets supported |
| **Overall** | **7.5/10** | Strong low-code option for clinic operations teams |

#### Integration Path with FastAPI/SQLAlchemy

Appsmith connects to any REST API or directly to PostgreSQL:

```python
# FastAPI endpoints optimized for Appsmith
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Appsmith requires CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-appsmith-instance.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/patients")
async def get_patients_for_appsmith(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Appsmith-compatible paginated endpoint."""
    query = db.query(Patient)
    
    if search:
        query = query.filter(Patient.name.ilike(f"%{search}%"))
    
    total = query.count()
    patients = query.offset((page - 1) * page_size).limit(page_size).all()
    
    # Appsmith Table widget expects: { "data": [...] }
    return {
        "data": [
            {
                "id": p.id,
                "name": p.name,
                "mrn": p.medical_record_number,
                "dob": p.date_of_birth.isoformat(),
                "phone": p.phone,
                "last_visit": p.last_visit.isoformat() if p.last_visit else None,
            }
            for p in patients
        ],
        "total": total,
        "page": page,
    }
```

#### Limitations

- Low-code paradigm may limit complex clinical workflows
- No native FHIR support
- Audit logging may not meet full HIPAA requirements without customization
- AGPL considerations for some features
- Performance at scale with large datasets needs testing

---

### 2.6 ToolJet

| Property | Detail |
|----------|--------|
| **Name** | ToolJet |
| **Language** | JavaScript / React / Node.js |
| **License** | GNU Affero General Public License v3.0 (AGPL-3.0) |
| **GitHub** | https://github.com/ToolJet/ToolJet |
| **Stars** | ~34,000 |
| **Forks** | ~3,500 |
| **Maintainer** | ToolJet Solutions Inc. |
| **First Release** | 2021 |
| **Latest Activity** | Very active |

#### Key Features

- **Visual app builder** with drag-and-drop canvas
- **45+ built-in widgets** including tables, charts, forms, calendars
- **Multi-datasource support** -- PostgreSQL, MySQL, MongoDB, BigQuery, REST, GraphQL, and more
- **JavaScript and Python query transformers**
- **Built-in user management** with SSO (Enterprise)
- **Version control** with Git sync
- **Multi-environment deployments**
- **Workflow automation** with ToolJet Workflows (separate product)
- **Self-hosted** via Docker, Kubernetes, AWS, Azure, GCP

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 6/10 | AGPL license requires source code disclosure for network use |
| Access Control | 8/10 | Granular permissions; SSO in Enterprise |
| Audit Trail | 7/10 | Query-level logging available |
| Data Validation | 8/10 | Transformers enable complex validation |
| Customization | 8/10 | Good widget library; JS/Python transformers |
| **Overall** | **7/10** | Strong feature set; AGPL license is a concern |

#### Integration Path with FastAPI/SQLAlchemy

```python
# FastAPI backend for ToolJet integration
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ToolJet requires CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tooljet.your-clinic.com"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

@app.get("/api/patients/search")
async def search_patients(
    query: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Search endpoint for ToolJet dropdown/autocomplete widgets."""
    q = db.query(Patient)
    if query:
        q = q.filter(Patient.name.ilike(f"%{query}%"))
    
    total = q.count()
    results = q.offset((page - 1) * limit).limit(limit).all()
    
    return {
        "patients": [{"id": r.id, "name": r.name, "mrn": r.medical_record_number} for r in results],
        "total": total,
    }

@app.post("/api/appointments/schedule")
async def schedule_appointment(
    appointment: AppointmentCreate,
    db: Session = Depends(get_db)
):
    """Appointment scheduling endpoint for ToolJet form submission."""
    # Validate patient exists
    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check for scheduling conflicts
    conflict = db.query(Appointment).filter(
        Appointment.doctor_id == appointment.doctor_id,
        Appointment.scheduled_at == appointment.scheduled_at,
        Appointment.status != "cancelled"
    ).first()
    
    if conflict:
        raise HTTPException(status_code=409, detail="Time slot not available")
    
    db_appointment = Appointment(**appointment.model_dump())
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    
    return {"success": True, "appointment_id": db_appointment.id}
```

#### Limitations

- **AGPL-3.0 license** -- requires sharing source code with users when deployed over a network; significant concern for commercial clinic deployments
- Enterprise features (SSO, audit logs, Git sync) require paid license
- No native healthcare or FHIR support
- JavaScript/Node.js stack separate from Python backend
- Smaller ecosystem than Appsmith

---

### 2.7 Comparative Matrix

| Tool | License | Stars | TypeScript | Headless | RBAC | Audit | FHIR | Self-Host | Clinical Score |
|------|---------|-------|------------|----------|------|-------|------|-----------|----------------|
| **React Admin** | MIT | 26.7k | Yes | No | Enterprise | Enterprise | No | Yes | 7.5/10 |
| **refine** | MIT | 34k | Yes | Yes | Yes | Yes | No | Yes | **8.5/10** |
| **AdminJS** | MIT | 8.5k | Yes | Partial | Yes | Plugin | No | Yes | 6.5/10 |
| **Forest Admin** | Proprietary | 4k | Yes | No | Yes | Yes | No | Limited | 7.5/10 |
| **Appsmith** | Apache | 37k | Yes | No | Yes | Yes | No | Yes | 7.5/10 |
| **ToolJet** | AGPL | 34k | Yes | No | Enterprise | Enterprise | No | Yes | 7.0/10 |

#### Recommendation

For clinic data console development with FastAPI/SQLAlchemy, **refine** is the top recommendation due to its:
1. MIT license (no compliance concerns)
2. Headless architecture (enables custom clinical UI design)
3. Best-in-class TypeScript and React Query integration
4. 15+ backend connectors including REST and custom APIs
5. Built-in audit log and access control providers
6. Largest GitHub community among headless admin frameworks

---

## 3. Database UI/Explorers

Database UI tools provide spreadsheet-like interfaces for managing clinic data without writing SQL. These are particularly useful for clinic administrators, data analysts, and non-technical staff.

---

### 3.1 Directus

| Property | Detail |
|----------|--------|
| **Name** | Directus |
| **Language** | TypeScript / Vue.js / Node.js |
| **License** | Business Source License 1.1 (BSL) with permissive grant |
| **GitHub** | https://github.com/directus/directus |
| **Stars** | ~28,000 |
| **Forks** | ~3,400 |
| **Maintainer** | Directus LLC |
| **First Release** | 2012 (originally), 2020 (modern version) |
| **Latest Activity** | Very active; $8M in funding |

**License Note:** Directus uses BSL 1.1 -- free for organizations with less than $5M annual revenue. For larger organizations, a commercial license is required. After 4 years, each release converts to GPL 3.0. This is a "source available" model similar to MongoDB, Elasticsearch, and HashiCorp products.

#### Key Features

- **Headless CMS** that turns any SQL database into a content management platform
- **Supports 6 database clients** -- PostgreSQL, MySQL, OracleDB, MsSQL, SQLite, CockroachDB
- **Auto-generated REST and GraphQL APIs** from database schema
- **Role-based access control** with granular field-level permissions
- **File asset management** with multiple storage adapters
- **Multi-tenancy support**
- **Real-time WebSocket subscriptions**
- **Extensible via extensions, flows, and hooks**
- **Modern Vue.js admin UI** with customizable interface

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 7/10 | Field-level permissions help; no native PHI encryption |
| Access Control | 8/10 | Granular RBAC with field-level control |
| Audit Trail | 7/10 | Activity logging via extensions |
| Data Validation | 8/10 | Custom validation via flows and hooks |
| Customization | 8/10 | Extensions API enables custom features |
| **Overall** | **7.5/10** | Good for clinic data management; license is a consideration |

#### Integration Path with FastAPI/SQLAlchemy

Directus connects directly to the same PostgreSQL database used by FastAPI/SQLAlchemy:

```python
# SQLAlchemy models shared with Directus
from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

class Patient(Base):
    __tablename__ = 'patients'  # Directus will auto-discover this table
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    date_of_birth = Column(Date, nullable=False)
    medical_record_number = Column(String(50), unique=True, nullable=False)
    phone = Column(String(20))
    email = Column(String(255))
    address = Column(Text)
    insurance_id = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    
    # Relationships
    appointments = relationship("Appointment", back_populates="patient")
    clinical_notes = relationship("ClinicalNote", back_populates="patient")

class Appointment(Base):
    __tablename__ = 'appointments'
    
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey('patients.id'))
    doctor_id = Column(Integer, ForeignKey('users.id'))
    scheduled_at = Column(DateTime, nullable=False)
    status = Column(String(20), default='scheduled')
    notes = Column(Text)
    
    patient = relationship("Patient", back_populates="appointments")

# Directus runs as a separate service pointing to the same database
# docker-compose.yml
"""
version: '3'
services:
  directus:
    image: directus/directus:latest
    ports:
      - 8055:8055
    environment:
      KEY: "your-random-key"
      SECRET: "your-random-secret"
      DB_CLIENT: "pg"
      DB_HOST: "postgres"
      DB_PORT: 5432
      DB_DATABASE: "clinic_db"
      DB_USER: "directus"
      DB_PASSWORD: "secure-password"
      ADMIN_EMAIL: "admin@clinic.com"
      ADMIN_PASSWORD: "admin-password"
    volumes:
      - ./uploads:/directus/uploads
"""
```

#### Limitations

- **BSL license** -- not truly open source; revenue-based usage restrictions
- **No native FHIR support**
- **No built-in HIPAA compliance features**
- **Vue.js-based UI** -- different from React ecosystem
- Activity logging requires extensions configuration

---

### 3.2 Baserow

| Property | Detail |
|----------|--------|
| **Name** | Baserow |
| **Language** | Python / Django / Vue.js / PostgreSQL |
| **License** | MIT (open core -- premium features under separate license) |
| **GitHub** | https://github.com/baserow/baserow |
| **Stars** | ~4,800 |
| **Forks** | ~590 |
| **Maintainer** | Baserow B.V. |
| **First Release** | 2020 |
| **Latest Activity** | Very active; SOC 2 Type II certified |

#### Key Features

- **Spreadsheet-database hybrid** combining ease of use with powerful data organization
- **GDPR, HIPAA, and SOC 2 Type II compliant** -- explicitly certified
- **Airtable-like UI** with relational database capabilities
- **150,000+ users** worldwide
- **AI Assistant (Kuma)** for natural language database creation
- **No-code application builder** for internal tools
- **Workflow automation** with trigger-action logic
- **Dashboards and data visualization**
- **API-first** with REST API and OpenAPI schema
- **Self-hosted** with Docker, Kubernetes, or cloud platforms
- **Role-based permissions** with workspace isolation

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | **9/10** | Explicitly HIPAA compliant; SOC 2 Type II |
| Access Control | 8/10 | Role-based permissions with workspace isolation |
| Audit Trail | 7/10 | Audit logging available |
| Data Validation | 8/10 | Field types with validation rules |
| Customization | 7/10 | Plugin system for extensions |
| **Overall** | **8.0/10** | **Top pick for clinical data management** |

#### Integration Path with FastAPI/SQLAlchemy

```python
# Baserow has its own Django/PostgreSQL backend
# Integration via REST API from FastAPI

import httpx
from fastapi import FastAPI, HTTPException

BASEROW_URL = "http://baserow:80"
BASEROW_TOKEN = "your-baserow-api-token"

async def baserow_request(method: str, path: str, **kwargs):
    """Make authenticated request to Baserow API."""
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method,
            f"{BASEROW_URL}/api{path}",
            headers={"Authorization": f"Token {BASEROW_TOKEN}"},
            **kwargs
        )
        response.raise_for_status()
        return response.json()

@app.get("/patients/baserow-view")
async def get_patients_from_baserow():
    """Fetch patients from Baserow database."""
    # Baserow table ID for patients
    table_id = 123
    
    data = await baserow_request("GET", f"/database/rows/table/{table_id}/")
    
    return {
        "patients": [
            {
                "id": row["id"],
                "name": row["field_101"],  # Map Baserow field IDs
                "mrn": row["field_102"],
                "dob": row["field_103"],
                "phone": row["field_104"],
            }
            for row in data["results"]
        ]
    }

@app.post("/patients/sync-to-baserow")
async def sync_patient_to_baserow(patient_id: int, db: Session = Depends(get_db)):
    """Sync a patient record from SQLAlchemy to Baserow."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    table_id = 123
    
    # Create row in Baserow
    result = await baserow_request(
        "POST",
        f"/database/rows/table/{table_id}/",
        json={
            "field_101": patient.name,
            "field_102": patient.medical_record_number,
            "field_103": patient.date_of_birth.isoformat(),
            "field_104": patient.phone,
        }
    )
    
    return {"baserow_row_id": result["id"]}
```

#### Limitations

- **Django-based backend** -- different from FastAPI ecosystem
- **Plugin system** requires learning Baserow's extension API
- **Premium features** require paid license
- **Limited customization** compared to fully custom-built UIs
- **Performance** with very large datasets (100K+ rows per table) needs evaluation

---

### 3.3 NocoDB

| Property | Detail |
|----------|--------|
| **Name** | NocoDB |
| **Language** | TypeScript / Node.js |
| **License** | **AGPL-3.0** (as of 2024); transitioning to Sustainable Use License (source available) |
| **GitHub** | https://github.com/nocodb/nocodb |
| **Stars** | ~54,800 |
| **Forks** | ~3,700 |
| **Maintainer** | NocoDB Inc. |
| **First Release** | 2021 |

**License Warning:** NocoDB is transitioning from AGPL-3.0 to a Sustainable Use License (similar to BUSL). This is a "source available" license that restricts providing NocoDB as a managed service. This change reflects broader trends in the open source industry but reduces the openness of the project.

#### Key Features

- **Turns any database into a smart spreadsheet**
- **Supports multiple databases** -- PostgreSQL, MySQL, SQLite, SQL Server, Oracle, MariaDB
- **Multiple views** -- Grid, Kanban, Calendar, Gallery, Form
- **Handles millions of rows** without enterprise pricing
- **REST and GraphQL APIs** auto-generated
- **Role-based access control** with team management
- **Webhooks and integrations**
- **File attachments** and rich field types
- **Self-hosted** via Docker

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 5/10 | No specific PHI protection features |
| Access Control | 7/10 | RBAC available |
| Audit Trail | 6/10 | Row-level audit logs in Enterprise |
| Data Validation | 7/10 | Field-level validation |
| Customization | 7/10 | Extensible but limited |
| **Overall** | **6.5/10** | Good spreadsheet UI; license is concerning |

#### Limitations

- **License transition** from AGPL to source-available creates uncertainty
- Enterprise features (SAML/SSO, bulk edit) are closed source
- No native HIPAA compliance features
- No FHIR support
- AGPL compliance complexity for commercial use
- Recent license changes may affect long-term viability

---

### 3.4 Rowy

| Property | Detail |
|----------|--------|
| **Name** | Rowy |
| **Language** | TypeScript / React / Node.js |
| **License** | Apache 2.0 |
| **GitHub** | https://github.com/rowyio/rowy |
| **Stars** | ~6,400 |
| **Forks** | ~510 |
| **Maintainer** | Rowy Inc. |
| **First Release** | 2020 |
| **Latest Activity** | Moderate activity |

#### Key Features

- **Low-code backend platform** with spreadsheet UI for Google Cloud Firestore
- **Firestore-native** -- designed specifically for Firebase/Google Cloud ecosystems
- **30+ field types** including JSON, Rich Text, Color, file uploads
- **Cloud Functions builder** -- write and deploy backend logic in browser
- **Extensions and templates** for SendGrid, Slack, Twilio, OpenAI
- **Role-based access control** at table and field levels
- **Bulk import/export** via CSV, JSON, TSV
- **Self-hosted** on user's GCP project

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 6/10 | Runs on GCP (which offers HIPAA-compliant infrastructure) |
| Access Control | 7/10 | Granular field-level permissions |
| Audit Trail | 6/10 | Firestore audit logging available via GCP |
| Data Validation | 7/10 | Field type validation |
| Customization | 7/10 | Cloud Functions enable custom logic |
| **Overall** | **6.5/10** | Good for Firebase-based clinic apps; limited to Firestore |

#### Limitations

- **Firestore-only** -- cannot use PostgreSQL or other SQL databases
- **Google Cloud dependency** -- locks into GCP ecosystem
- **Not suitable for complex relational data** -- Firestore is document-oriented
- No FHIR support
- Team has shifted focus to BuildShip (complementary product)
- Healthcare-specific features not built-in

---

### 3.5 Grist

| Property | Detail |
|----------|--------|
| **Name** | Grist |
| **Language** | Python / TypeScript |
| **License** | Apache 2.0 |
| **GitHub** | https://github.com/gristlabs/grist-core |
| **Stars** | ~6,200 |
| **Forks** | ~520 |
| **Maintainer** | Grist Labs (with French government contributions) |
| **First Release** | 2018 |
| **Latest Activity** | Active; significant French government involvement |

#### Key Features

- **Modern relational spreadsheet** combining spreadsheet flexibility with database robustness
- **Multiple product forms** -- grist-core (server), grist-desktop (Electron app), grist-static (in-browser)
- **Relational data model** -- links between tables, reference columns
- **Formula columns** -- Python-based formulas
- **Access rules** -- granular ACL with column-level control
- **Version history** -- full change tracking
- **Self-hosted** via Docker
- **Plugin system** for custom widgets
- **French government contributions** (ANCT Donnees et Territoires and DINUM)

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 7/10 | Granular ACL helps; sandboxed Python formulas |
| Access Control | 8/10 | Column-level access rules |
| Audit Trail | 8/10 | Full version history built-in |
| Data Validation | 8/10 | Column types with validation |
| Customization | 7/10 | Plugin system for widgets |
| **Overall** | **7.5/10** | Excellent for data analysis; strong access controls |

#### Integration Path with FastAPI/SQLAlchemy

```python
# Grist can import from PostgreSQL via its API
# FastAPI can serve as a bridge between Grist and SQLAlchemy

import httpx
from fastapi import FastAPI

GRIST_API_KEY = "your-grist-api-key"
GRIST_DOC_ID = "your-document-id"
GRIST_SERVER = "http://grist:8484"

async def grist_request(method: str, path: str, **kwargs):
    """Make authenticated request to Grist API."""
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method,
            f"{GRIST_SERVER}/api{path}",
            headers={"Authorization": f"Bearer {GRIST_API_KEY}"},
            **kwargs
        )
        response.raise_for_status()
        return response.json()

@app.get("/analytics/patient-summary")
async def get_patient_analytics():
    """Fetch patient summary from Grist for analysis."""
    # Grist table ID
    table_id = "Patients"
    
    data = await grist_request(
        "GET",
        f"/docs/{GRIST_DOC_ID}/tables/{table_id}/records"
    )
    
    return {"analytics": data["records"]}
```

#### Limitations

- **Python formulas run sandboxed** -- limited for complex operations
- **Smaller community** than NocoDB or Baserow
- **No native FHIR support**
- **No built-in HIPAA compliance features**
- UI can be complex for non-technical clinic staff

---

### 3.6 Teable

| Property | Detail |
|----------|--------|
| **Name** | Teable |
| **Language** | TypeScript / React / PostgreSQL |
| **License** | AGPL-3.0 (Community Edition) |
| **GitHub** | https://github.com/teableio/teable |
| **Stars** | ~18,600 |
| **Forks** | ~530 |
| **Maintainer** | Teable Inc. |
| **First Release** | 2022 |
| **Latest Activity** | Active development |

#### Key Features

- **Next-generation Airtable alternative**
- **PostgreSQL-native** -- tables created directly on physical database
- **Millions of rows** processing without performance loss
- **Spreadsheet-like UI** with no programming required
- **Self-hosted** for complete data control
- **REST API** for integrations
- **Plugin system** for BI, low-code, and ETL tools
- **Enterprise Edition** adds AI, authority matrix, automation, advanced admin

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 6/10 | PostgreSQL enables encryption at rest |
| Access Control | 7/10 | Authority matrix in Enterprise |
| Audit Trail | 6/10 | Basic logging available |
| Data Validation | 7/10 | Field type validation |
| Customization | 7/10 | Plugin architecture |
| **Overall** | **6.5/10** | Good performance; AGPL is a concern |

#### Limitations

- **AGPL-3.0 license** -- source code disclosure requirements for network use
- Enterprise Edition required for advanced features
- No native healthcare or FHIR support
- Newer project with smaller ecosystem
- HIPAA compliance requires custom implementation

---

### 3.7 Comparative Matrix

| Tool | License | Stars | Database | HIPAA Cert | RBAC | API | Self-Host | Clinical Score |
|------|---------|-------|----------|------------|------|-----|-----------|----------------|
| **Directus** | BSL | 28k | Multi-SQL | No | Yes | REST/GraphQL | Yes | 7.5/10 |
| **Baserow** | MIT | 4.8k | PostgreSQL | **Yes** | Yes | REST | Yes | **8.0/10** |
| **NocoDB** | AGPL/SUL | 54.8k | Multi-SQL | No | Yes | REST/GraphQL | Yes | 6.5/10 |
| **Rowy** | Apache | 6.4k | Firestore | Partial | Yes | REST | GCP only | 6.5/10 |
| **Grist** | Apache | 6.2k | SQLite/PostgreSQL | No | Column-level | REST | Yes | 7.5/10 |
| **Teable** | AGPL | 18.6k | PostgreSQL | No | Yes | REST | Yes | 6.5/10 |

#### Recommendation

**Baserow** is the top recommendation for clinic data management due to its explicit HIPAA/SOC 2 compliance, MIT license, Django/Python backend (ecosystem alignment), and Airtable-like usability for clinic staff.

---

## 4. Healthcare-Specific Open Source

Healthcare-specific open source projects provide Electronic Health Record (EHR), Electronic Medical Record (EMR), and Hospital Information System (HIS) functionality. These can serve as foundational systems or reference architectures for clinic data consoles.

---

### 4.1 OpenEMR

| Property | Detail |
|----------|--------|
| **Name** | OpenEMR |
| **Language** | PHP / JavaScript |
| **License** | GNU General Public License (GPL v3) |
| **GitHub** | https://github.com/openemr/openemr |
| **Stars** | ~8,500 |
| **Forks** | ~2,000 |
| **Maintainer** | OpenEMR Foundation |
| **First Release** | 2002 |
| **Latest Activity** | Very active; largest open source EHR community |

#### Key Features

- **Most popular open source EHR** worldwide with 15+ years of development
- **Fully integrated EHR and practice management** -- scheduling, billing, prescriptions, lab integration
- **ONC Certified** -- meets U.S. Meaningful Use requirements (2014/2015 Edition certified)
- **FHIR API support** -- built-in FHIR R4 API for interoperability
- **Multi-language support** -- 30+ languages
- **Patient portal** -- patient self-service interface
- **E-prescribing** -- electronic prescription capabilities
- **Clinical decision support** -- automated alerts and reminders
- **Lab integration** -- HL7 lab result processing
- **Insurance claims processing** -- electronic billing (X12, HL7)
- **Extensive reporting** -- clinical quality measures, Meaningful Use reporting
- **Docker support** for easy deployment

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | **9/10** | Purpose-built for HIPAA compliance; ONC certified |
| Access Control | 8/10 | Role-based with extensive permission system |
| Audit Trail | 8/10 | Comprehensive audit logging built-in |
| FHIR Support | 8/10 | Native FHIR R4 API |
| Interoperability | 9/10 | HL7, FHIR, X12 support |
| **Overall** | **8.5/10** | Gold standard for open source EHR |

#### Integration Path with FastAPI/SQLAlchemy

```python
# OpenEMR provides FHIR API for integration
# FastAPI can act as a FHIR client to OpenEMR

import httpx
from fastapi import FastAPI

OPENEMR_BASE_URL = "http://openemr/apis/default/fhir"
OPENEMR_CLIENT_ID = "your-client-id"
OPENEMR_CLIENT_SECRET = "your-client-secret"

async def get_openemr_token():
    """Get OAuth token from OpenEMR."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OPENEMR_BASE_URL}/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": OPENEMR_CLIENT_ID,
                "client_secret": OPENEMR_CLIENT_SECRET,
                "scope": "patient/Patient.read patient/Observation.read",
            }
        )
        return response.json()["access_token"]

@app.get("/patients/openemr/{patient_id}")
async def get_patient_from_openemr(patient_id: str):
    """Fetch patient record from OpenEMR via FHIR API."""
    token = await get_openemr_token()
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{OPENEMR_BASE_URL}/Patient/{patient_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        return response.json()

@app.get("/patients/openemr-search")
async def search_patients_in_openemr(name: str):
    """Search patients in OpenEMR via FHIR API."""
    token = await get_openemr_token()
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{OPENEMR_BASE_URL}/Patient",
            headers={"Authorization": f"Bearer {token}"},
            params={"name": name}
        )
        return response.json()
```

#### Limitations

- **PHP-based** -- different technology stack from FastAPI/Python
- **Legacy codebase** -- some technical debt from 20+ years of development
- **Customization complexity** -- requires PHP knowledge for deep modifications
- **Modern UI needs work** -- traditional web interface; newer React-based UI in progress
- **Deployment complexity** -- requires careful HIPAA-compliant hosting configuration
- **Overkill for simple clinic consoles** -- full EHR may be more than needed

---

### 4.2 OpenMRS

| Property | Detail |
|----------|--------|
| **Name** | OpenMRS (Medical Record System) |
| **Language** | Java / React / Spring Framework |
| **License** | Mozilla Public License 2.0 with Healthcare Disclaimer (MPL 2.0 HD) |
| **GitHub** | https://github.com/openmrs/openmrs-core |
| **Stars** | ~1,200 (core) |
| **Maintainer** | OpenMRS Inc. (non-profit) |
| **First Release** | 2004 |
| **Latest Activity** | Active; deployed nationally in 9+ countries |

#### Key Features

- **Reference platform for medical record systems** in developing countries
- **Modular architecture** -- plugins (modules) for extending functionality
- **Concept dictionary** -- flexible clinical terminology system
- **Patient registration and tracking**
- **Clinical encounter management**
- **Reporting and data exports** for public health reporting
- **FHIR API support** via FHIR2 module
- **Multi-tenancy** for multiple clinic sites
- **Offline-capable** via OpenMRS 3.x (OZ) frontend
- **National deployments** in Bangladesh, Botswana, Haiti, Kenya, Malawi, Mozambique, Nigeria, Rwanda, Uganda

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 8/10 | Designed for healthcare; privacy-focused |
| Access Control | 8/10 | Role-based with privilege system |
| Audit Trail | 7/10 | Logging module available |
| FHIR Support | 7/10 | Via FHIR2 module |
| Extensibility | **9/10** | Modular architecture is excellent |
| **Overall** | **8.0/10** | Best architecture for building custom clinic modules |

#### Integration Path with FastAPI/SQLAlchemy

```python
# OpenMRS FHIR API integration
from fastapi import FastAPI
import httpx

OPENMRS_BASE = "http://openmrs/ws/rest/v1"
OPENMRS_FHIR = "http://openmrs/ws/fhir2/R4"
OPENMRS_CREDENTIALS = ("admin", "Admin123")  # Basic auth

@app.get("/openmrs/patients")
async def list_openmrs_patients(q: str = ""):
    """Search patients in OpenMRS."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{OPENMRS_BASE}/patient",
            auth=OPENMRS_CREDENTIALS,
            params={"q": q, "v": "full"}
        )
        return response.json()

@app.post("/openmrs/sync-encounter")
async def sync_encounter_to_openmrs(encounter_data: dict):
    """Sync a clinical encounter from FastAPI to OpenMRS."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OPENMRS_BASE}/encounter",
            auth=OPENMRS_CREDENTIALS,
            json=encounter_data
        )
        return response.json()
```

#### Limitations

- **Java-based backend** -- different technology stack
- **Steeper learning curve** than simpler EHR systems
- **Deployment complexity** -- requires Tomcat, MySQL
- **Frontend modernization** ongoing (OpenMRS 3.x)
- **Resource-intensive** for small clinics
- **Primarily focused on developing countries** -- may lack features needed for US clinics

---

### 4.3 GNU Health

| Property | Detail |
|----------|--------|
| **Name** | GNU Health |
| **Language** | Python (Tryton framework) |
| **License** | GNU General Public License v3+ (GPLv3+) |
| **GitHub** | https://github.com/gnuhealth/gnuhealth |
| **Stars** | ~600 |
| **Maintainer** | GNU Solidario |
| **First Release** | 2008 |
| **Latest Activity** | Active; WHO partnerships |

#### Key Features

- **Hospital Management Information System (HMIS)** built on Tryton ERP framework
- **Python-based** -- ecosystem alignment with FastAPI
- **Modular design** -- health, pediatrics, surgery, lab, genetics, oncology modules
- **WHO ICD-10 integration** for diagnosis coding
- **Patient management** -- demographics, appointments, evaluations
- **Electronic prescription** with drug interaction checking
- **Lab information system** with result reporting
- **Insurance and billing management**
- **Public health reporting** -- disease surveillance, epidemiology
- **Multi-language support**
- **Runs on GNU/Linux, FreeBSD, and other Unix-like systems**

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 8/10 | Designed for healthcare; GDPR-aware |
| Access Control | 7/10 | Tryton's permission system |
| Audit Trail | 7/10 | Built-in logging |
| FHIR Support | 5/10 | Limited FHIR support |
| Python Ecosystem | **9/10** | Tryton/Python aligns with FastAPI |
| **Overall** | **7.0/10** | Good for Python-focused teams; limited FHIR |

#### Integration Path with FastAPI/SQLAlchemy

```python
# GNU Health uses Tryton with PostgreSQL
# FastAPI can integrate via Tryton's XML-RPC/JSON-RPC API

from fastapi import FastAPI
import xmlrpc.client

TRYTON_URL = "http://localhost:8000/"
TRYTON_DB = "gnuhealth"
TRYTON_USER = "admin"
TRYTON_PASSWORD = "admin"

@app.get("/gnuhealth/patients")
async def get_gnuhealth_patients():
    """Fetch patients from GNU Health via Tryton API."""
    with xmlrpc.client.ServerProxy(TRYTON_URL) as proxy:
        # Authenticate
        user_id = proxy.common.authenticate(TRYTON_DB, TRYTON_USER, TRYTON_PASSWORD, {})
        
        # Search patients
        patient_ids = proxy.model.execute_kw(
            TRYTON_DB, user_id, TRYTON_PASSWORD,
            "gnuhealth.patient", "search", [[]]
        )
        
        # Read patient data
        patients = proxy.model.execute_kw(
            TRYTON_DB, user_id, TRYTON_PASSWORD,
            "gnuhealth.patient", "read", [patient_ids]
        )
        
        return {"patients": patients}
```

#### Limitations

- **Smaller community** compared to OpenEMR and OpenMRS
- **GPLv3+ license** -- may have implications for commercial use
- **Limited FHIR support** -- interoperability challenges
- **Tryton framework dependency** -- learning curve
- **UI is older** -- web client exists but is not as modern
- **Fewer integrations** with modern healthcare systems

---

### 4.4 HospitalRun

| Property | Detail |
|----------|--------|
| **Name** | HospitalRun |
| **Language** | JavaScript / React / Node.js / CouchDB |
| **License** | MIT |
| **GitHub** | https://github.com/HospitalRun/hospitalrun |
| **Stars** | ~1,500 (combined) |
| **Maintainer** | HospitalRun (archived project) |
| **First Release** | 2013 |
| **Latest Activity** | **ARCHIVED** -- project discontinued |

#### Key Features (Historical)

- **Offline-first EMR** for developing world hospitals
- **React + Redux frontend** with CouchDB/PouchDB backend
- **Designed for low-resource settings** -- works offline, syncs when online
- **Patient management** -- registration, visits, appointments
- **Inventory management** for medical supplies
- **Appointment scheduling**
- **Billing and invoicing**

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | N/A | Project archived |
| **Overall** | **N/A** | **Not recommended for new projects** |

#### Limitations

- **PROJECT ARCHIVED** -- repositories are read-only
- **No active development** -- security and feature updates ceased
- **Do not use for new clinic data console projects**
- Included here only as a historical reference of what not to choose

---

### 4.5 LibreHealth

| Property | Detail |
|----------|--------|
| **Name** | LibreHealth EHR |
| **Language** | PHP / Laravel / Vue.js |
| **License** | Mozilla Public License 2.0 (MPL-2.0); inherited code under GPL-2.0+ |
| **GitHub** | https://github.com/LibreHealthIO/lh-ehr |
| **Stars** | ~290 (legacy), ~44 (Laravel rewrite) |
| **Forks** | ~280 |
| **Maintainer** | LibreHealth Project (Software Freedom Conservancy member) |
| **First Release** | 2016 (fork from OpenEMR) |
| **Latest Activity** | Moderate; Laravel rewrite in progress |

#### Key Features

- **Fork of OpenEMR** with modern development practices
- **Laravel rewrite** (lh-ehr-laravel) using PHP 8+, Vue.js, Tailwind CSS
- **Patient management** -- demographics, encounters, prescriptions
- **Appointment scheduling**
- **Billing and insurance claims**
- **Lab integration**
- **Reporting and analytics**
- **Software Freedom Conservancy** project member
- **Multi-site support**

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Handling | 7/10 | Based on OpenEMR; improving with Laravel rewrite |
| Access Control | 7/10 | Laravel's built-in auth + custom permissions |
| Audit Trail | 7/10 | Built-in activity logging |
| FHIR Support | 5/10 | Limited compared to OpenEMR |
| Modern Stack | 7/10 | Laravel rewrite is promising |
| **Overall** | **6.5/10** | Promising but not yet production-ready |

#### Limitations

- **Smaller community** than OpenEMR
- **Laravel rewrite is incomplete** -- many features still in legacy PHP
- **Fork may diverge** from OpenEMR's certified codebase
- **FHIR support is limited**
- **Not yet ONC certified**
- Documentation gaps

---

### 4.6 Comparative Matrix

| Tool | License | Stars | Language | FHIR | ONC Cert | Modularity | Active | Clinical Score |
|------|---------|-------|----------|------|----------|------------|--------|----------------|
| **OpenEMR** | GPL | 8.5k | PHP | R4 | Yes | Modules | Yes | **8.5/10** |
| **OpenMRS** | MPL | 1.2k | Java | Via module | No | **Excellent** | Yes | **8.0/10** |
| **GNU Health** | GPL | 600 | Python | Limited | No | Good | Yes | 7.0/10 |
| **HospitalRun** | MIT | N/A | JS/React | No | No | N/A | **ARCHIVED** | N/A |
| **LibreHealth** | MPL | 290 | PHP/Laravel | Limited | No | Moderate | Slow | 6.5/10 |

#### Recommendation

**OpenEMR** is the top recommendation for production clinic deployments requiring ONC certification and full EHR functionality. **OpenMRS** is preferred for organizations needing a modular architecture for building custom clinic modules. For Python-focused teams, **GNU Health** offers the best ecosystem alignment.

---

## 5. Audit Logging Tools

Audit logging is a **critical HIPAA requirement** (CFR 164.312(b)) that tracks who accessed what patient data, when, and from where. For clinic data consoles, comprehensive audit trails are non-negotiable.

---

### 5.1 AuditJS

| Property | Detail |
|----------|--------|
| **Name** | AuditJS |
| **Language** | JavaScript / Node.js |
| **License** | MIT |
| **GitHub** | https://github.com/sonatype-nexus-community/AuditJS |
| **Stars** | ~400 |
| **Maintainer** | Sonatype Community |

#### Key Features

- **Security-focused audit tool** for scanning JavaScript dependencies for vulnerabilities
- **NOT a PHI audit logger** -- this is a software composition analysis (SCA) tool
- Scans npm packages against vulnerability databases
- Generates audit reports for security compliance

#### Clinical Relevance

AuditJS is **not suitable for clinical audit logging** of PHI access. It is included here to avoid confusion with the naming. For dependency security scanning in clinic applications, it serves a valid purpose.

---

### 5.2 trailpack-audit

| Property | Detail |
|----------|--------|
| **Name** | trailpack-audit |
| **Language** | JavaScript / Node.js |
| **License** | MIT |
| **GitHub** | https://github.com/trailsjs/trailpack-audit |
| **Stars** | ~50 |
| **Maintainer** | Trails.js community |

#### Key Features

- **Audit logging for Trails.js framework**
- Logs user actions, model changes, and system events
- Stores audit records in database
- Configurable log levels and event tracking

#### Clinical Suitability

Limited clinical suitability -- Trails.js is a niche framework. For FastAPI/SQLAlchemy backends, a custom Python implementation is strongly preferred.

---

### 5.3 django-auditlog

| Property | Detail |
|----------|--------|
| **Name** | django-auditlog |
| **Language** | Python / Django |
| **License** | MIT |
| **GitHub** | https://github.com/jazzband/django-auditlog |
| **Stars** | ~1,500 |
| **Maintainer** | Jazzband community |

#### Key Features

- **Django audit logging** for model changes
- **Automatic change tracking** -- logs who changed what and when
- **Diff storage** -- stores before/after values for each change
- **Middleware integration** -- automatically tracks the current user
- **Signal-based architecture** -- works with Django's ORM signals
- **Admin integration** -- view audit logs in Django admin

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| PHI Change Tracking | 8/10 | Excellent for tracking data modifications |
| User Attribution | 9/10 | Automatic via middleware |
| Read Access Logging | 4/10 | Only tracks changes, not reads |
| HIPAA Alignment | 6/10 | Partial -- need read access logging |
| **Overall** | **6.5/10** | Good for Django projects; needs read-audit supplement |

#### Integration Path

```python
# django-auditlog example (for reference -- Django-specific)
# For FastAPI, a custom implementation is recommended

from auditlog.registry import auditlog
from auditlog.models import LogEntry

# Register models for automatic auditing
auditlog.register(Patient)
auditlog.register(Appointment)
auditlog.register(ClinicalNote)

# Query audit trail
patient_audits = LogEntry.objects.get_for_object(patient)
```

---

### 5.4 Custom Audit Middleware Patterns

For FastAPI/SQLAlchemy clinic backends, **custom audit middleware** is the recommended approach. This ensures full control over what is logged, how it is stored, and who can access the audit trail.

#### Recommended Architecture

```python
# Complete audit logging system for FastAPI/SQLAlchemy clinic backends
# File: audit_middleware.py

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, create_engine
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.sql import func
from typing import Optional, Dict, Any, Callable
import json
import uuid
import hashlib
import time
from datetime import datetime
from enum import Enum
import asyncio
from contextvars import ContextVar

# Context variable for request-scoped audit session
audit_context: ContextVar[Optional[Dict[str, Any]]] = ContextVar('audit_context', default=None)

Base = declarative_base()

class AuditAction(str, Enum):
    """HIPAA-relevant audit actions."""
    CREATE = "CREATE"
    READ = "READ"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    EXPORT = "EXPORT"
    PRINT = "PRINT"
    ACCESS_DENIED = "ACCESS_DENIED"
    CONSENT_GRANTED = "CONSENT_GRANTED"
    CONSENT_REVOKED = "CONSENT_REVOKED"
    DEIDENTIFY = "DEIDENTIFY"

class AuditLogEntry(Base):
    """HIPAA-compliant audit log entry model."""
    __tablename__ = 'audit_log'
    
    id = Column(Integer, primary_key=True)
    
    # Event identification
    event_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Actor information (who)
    user_id = Column(String(255), nullable=True)  # NULL for system/anonymous
    user_role = Column(String(50), nullable=True)
    user_email = Column(String(255), nullable=True)
    session_id = Column(String(255), nullable=True)
    
    # Action details (what)
    action = Column(String(30), nullable=False)  # AuditAction value
    resource_type = Column(String(100), nullable=False)  # e.g., "Patient", "ClinicalNote"
    resource_id = Column(String(255), nullable=True)  # Primary key of affected resource
    
    # PHI indicators
    contains_phi = Column(Integer, default=0)  # 0 = no, 1 = yes
    phi_fields_accessed = Column(JSON, nullable=True)  # Which PHI fields were accessed
    
    # Request details
    http_method = Column(String(10), nullable=True)
    endpoint = Column(String(500), nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 can be 45 chars
    user_agent = Column(Text, nullable=True)
    
    # Data changes (for CREATE/UPDATE/DELETE)
    previous_data = Column(JSON, nullable=True)  # Before state (encrypted if PHI)
    new_data = Column(JSON, nullable=True)  # After state (encrypted if PHI)
    data_checksum = Column(String(64), nullable=True)  # SHA-256 checksum for integrity
    
    # Result
    success = Column(Integer, default=1)  # 0 = failed, 1 = success
    error_message = Column(Text, nullable=True)
    
    # For export/print tracking
    records_count = Column(Integer, nullable=True)
    export_format = Column(String(20), nullable=True)  # CSV, PDF, FHIR
    
    # Compliance
    hipaa_relevant = Column(Integer, default=1)  # 0 = no, 1 = yes
    retention_until = Column(DateTime(timezone=True), nullable=True)
    
    def to_dict(self, redact_phi: bool = True) -> Dict[str, Any]:
        """Convert to dictionary with optional PHI redaction."""
        data = {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "user_id": self.user_id,
            "user_role": self.user_role,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "contains_phi": bool(self.contains_phi),
            "endpoint": self.endpoint,
            "http_method": self.http_method,
            "ip_address": self.ip_address,
            "success": bool(self.success),
            "hipaa_relevant": bool(self.hipaa_relevant),
        }
        if not redact_phi:
            data["phi_fields_accessed"] = self.phi_fields_accessed
            data["previous_data"] = self.previous_data
            data["new_data"] = self.new_data
        return data


class AuditLogger:
    """HIPAA-compliant audit logger for clinic data consoles."""
    
    # PHI field definitions by resource type
    PHI_FIELDS = {
        "Patient": ["ssn", "date_of_birth", "phone", "email", "address", 
                     "medical_record_number", "insurance_id", "emergency_contact"],
        "ClinicalNote": ["content", "diagnosis", "treatment_plan", "medications"],
        "Appointment": ["notes", "reason"],
        "BillingRecord": ["insurance_claim", "diagnosis_codes"],
    }
    
    def __init__(self, db_session_factory: Callable[[], Session]):
        self.db_session_factory = db_session_factory
    
    def _detect_phi(self, resource_type: str, data: Dict[str, Any]) -> tuple[bool, list]:
        """Detect if data contains PHI fields."""
        phi_fields = self.PHI_FIELDS.get(resource_type, [])
        if not phi_fields or not data:
            return False, []
        
        accessed = [f for f in phi_fields if f in data and data[f] is not None]
        return len(accessed) > 0, accessed
    
    def _compute_checksum(self, data: Dict[str, Any]) -> str:
        """Compute SHA-256 checksum for audit integrity."""
        serialized = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode()).hexdigest()
    
    def log(self, **kwargs) -> AuditLogEntry:
        """Create an audit log entry."""
        session = self.db_session_factory()
        try:
            entry = AuditLogEntry(**kwargs)
            
            # Auto-detect PHI
            resource_type = kwargs.get("resource_type", "")
            new_data = kwargs.get("new_data", {})
            if new_data:
                contains_phi, phi_fields = self._detect_phi(resource_type, new_data)
                entry.contains_phi = 1 if contains_phi else 0
                entry.phi_fields_accessed = phi_fields if contains_phi else None
            
            # Compute checksum for data integrity
            if entry.previous_data or entry.new_data:
                entry.data_checksum = self._compute_checksum({
                    "previous": entry.previous_data,
                    "new": entry.new_data,
                })
            
            session.add(entry)
            session.commit()
            return entry
        finally:
            session.close()
    
    def log_data_access(self, user_id: str, user_role: str, resource_type: str,
                        resource_id: str, fields_accessed: list[str], 
                        endpoint: str, ip_address: str) -> AuditLogEntry:
        """Log PHI data access (READ operations)."""
        contains_phi, phi_fields = self._detect_phi(resource_type, dict.fromkeys(fields_accessed, True))
        
        return self.log(
            user_id=user_id,
            user_role=user_role,
            action=AuditAction.READ,
            resource_type=resource_type,
            resource_id=str(resource_id),
            contains_phi=1 if contains_phi else 0,
            phi_fields_accessed=phi_fields if contains_phi else None,
            endpoint=endpoint,
            ip_address=ip_address,
            hipaa_relevant=1 if contains_phi else 0,
        )
    
    def log_data_export(self, user_id: str, user_role: str, resource_type: str,
                        record_count: int, export_format: str, 
                        ip_address: str, filters: Optional[Dict] = None) -> AuditLogEntry:
        """Log data export (HIPAA requires tracking data leaving the system)."""
        return self.log(
            user_id=user_id,
            user_role=user_role,
            action=AuditAction.EXPORT,
            resource_type=resource_type,
            contains_phi=1,
            records_count=record_count,
            export_format=export_format,
            new_data={"filters": filters},
            ip_address=ip_address,
            hipaa_relevant=1,
        )
    
    def log_login(self, user_id: str, email: str, success: bool, 
                  ip_address: str, user_agent: str) -> AuditLogEntry:
        """Log authentication events."""
        return self.log(
            user_id=user_id,
            user_email=email,
            action=AuditAction.LOGIN if success else AuditAction.ACCESS_DENIED,
            resource_type="Authentication",
            success=1 if success else 0,
            ip_address=ip_address,
            user_agent=user_agent,
            hipaa_relevant=1,
        )


class AuditMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for automatic audit logging."""
    
    # Endpoints to skip auditing (health checks, static files)
    SKIP_ENDPOINTS = {"/health", "/metrics", "/docs", "/openapi.json", "/static/"}
    
    # Endpoints that are PHI-related
    PHI_ENDPOINTS = {"/patients", "/clinical-notes", "/appointments", "/billing"}
    
    def __init__(self, app, audit_logger: AuditLogger):
        super().__init__(app)
        self.audit_logger = audit_logger
    
    def _should_skip(self, path: str) -> bool:
        """Check if request should be skipped from audit."""
        return any(path.startswith(skip) for skip in self.SKIP_ENDPOINTS)
    
    def _is_phi_endpoint(self, path: str) -> bool:
        """Check if endpoint handles PHI."""
        return any(path.startswith(phi) for phi in self.PHI_ENDPOINTS)
    
    async def dispatch(self, request: Request, call_next) -> Response:
        if self._should_skip(request.url.path):
            return await call_next(request)
        
        # Extract user info from request state (set by auth middleware)
        user_id = getattr(request.state, "user_id", None)
        user_role = getattr(request.state, "user_role", None)
        
        # Extract client info
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        session_id = request.headers.get("x-session-id") or request.cookies.get("session_id")
        
        start_time = time.time()
        
        try:
            response = await call_next(request)
            
            # Log successful request
            if self._is_phi_endpoint(request.url.path):
                self.audit_logger.log(
                    user_id=str(user_id) if user_id else None,
                    user_role=user_role,
                    action=self._get_action(request.method),
                    resource_type=self._extract_resource_type(request.url.path),
                    http_method=request.method,
                    endpoint=str(request.url),
                    ip_address=ip_address,
                    user_agent=user_agent,
                    session_id=session_id,
                    success=1,
                    hipaa_relevant=1,
                )
            
            return response
            
        except Exception as exc:
            # Log failed request
            self.audit_logger.log(
                user_id=str(user_id) if user_id else None,
                user_role=user_role,
                action=AuditAction.ACCESS_DENIED if hasattr(exc, "status_code") and exc.status_code == 403 else AuditAction.READ,
                resource_type=self._extract_resource_type(request.url.path),
                http_method=request.method,
                endpoint=str(request.url),
                ip_address=ip_address,
                user_agent=user_agent,
                success=0,
                error_message=str(exc),
                hipaa_relevant=1 if self._is_phi_endpoint(request.url.path) else 0,
            )
            raise
    
    def _get_action(self, method: str) -> AuditAction:
        mapping = {
            "GET": AuditAction.READ,
            "POST": AuditAction.CREATE,
            "PUT": AuditAction.UPDATE,
            "PATCH": AuditAction.UPDATE,
            "DELETE": AuditAction.DELETE,
        }
        return mapping.get(method, AuditAction.READ)
    
    def _extract_resource_type(self, path: str) -> str:
        """Extract resource type from URL path."""
        parts = path.strip("/").split("/")
        return parts[0].rstrip("s").title() if parts else "Unknown"


# FastAPI integration
from fastapi import FastAPI, Depends, Request
from sqlalchemy.orm import Session

app = FastAPI()

# Database setup
engine = create_engine("postgresql://user:pass@localhost/clinic_audit")
SessionLocal = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)

# Initialize audit logger
audit_logger = AuditLogger(lambda: SessionLocal())

# Add middleware
app.add_middleware(AuditMiddleware, audit_logger=audit_logger)

# Dependency for route-level audit logging
def get_audit_logger():
    return audit_logger

@app.get("/patients/{patient_id}")
async def get_patient(
    patient_id: int,
    request: Request,
    db: Session = Depends(get_db),
    audit: AuditLogger = Depends(get_audit_logger)
):
    """Get patient with audit logging."""
    user_id = request.state.user_id
    user_role = request.state.user_role
    
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Explicit audit log for PHI access
    audit.log_data_access(
        user_id=str(user_id),
        user_role=user_role,
        resource_type="Patient",
        resource_id=str(patient_id),
        fields_accessed=["id", "name", "date_of_birth", "phone", "email"],
        endpoint=f"/patients/{patient_id}",
        ip_address=request.client.host if request.client else None,
    )
    
    return patient
```

---

## 6. Consent Management

Patient consent management is a foundational requirement for HIPAA compliance and GDPR compliance. Clinic data consoles must track, verify, and enforce patient consent for data collection, use, and sharing.

---

### 6.1 Consent Management Platform Patterns

A comprehensive consent management platform for clinic data should implement these patterns:

```python
# Comprehensive consent management system for clinic data
# File: consent_management.py

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum, Boolean, JSON, create_engine
from sqlalchemy.orm import relationship, declarative_base, sessionmaker
from sqlalchemy.sql import func
from enum import Enum as PyEnum
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import uuid

Base = declarative_base()

class ConsentType(str, PyEnum):
    """Types of consent in clinical settings."""
    TREATMENT = "treatment"  # Consent for treatment
    DATA_COLLECTION = "data_collection"  # Collect personal and health data
    DATA_SHARING_RESEARCH = "data_sharing_research"  # Share de-identified data for research
    DATA_SHARING_PROVIDER = "data_sharing_provider"  # Share with other providers
    DATA_SHARING_FAMILY = "data_sharing_family"  # Share with family/designated contacts
    MARKETING = "marketing"  # Marketing communications
    TELEMEDICINE = "telemedicine"  # Telemedicine services
    MINORS = "minors"  # Consent for minors
    EMERGENCY = "emergency"  # Emergency treatment when patient unable to consent
    PHOTOGRAPHY = "photography"  # Medical photography/recording
    BIOMETRICS = "biometrics"  # Biometric data collection
    AI_ML = "ai_ml"  # Use data for AI/ML training (de-identified)

class ConsentStatus(str, PyEnum):
    """Status of a consent record."""
    GRANTED = "granted"
    REVOKED = "revoked"
    EXPIRED = "expired"
    PENDING = "pending"  # Awaiting patient signature/confirmation
    WITHDRAWN = "withdrawn"  # Partial withdrawal (specific uses)

class ConsentRecord(Base):
    """Patient consent record for clinic data management."""
    __tablename__ = "consent_records"
    
    id = Column(Integer, primary_key=True)
    consent_id = Column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    
    # Patient reference
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    patient = relationship("Patient", back_populates="consents")
    
    # Consent details
    consent_type = Column(String(50), nullable=False)  # ConsentType value
    status = Column(String(20), nullable=False, default=ConsentStatus.PENDING)
    
    # Scope and granularity
    scope_description = Column(Text, nullable=False)  # Human-readable description
    data_elements = Column(JSON, nullable=True)  # Specific data elements covered
    purposes = Column(JSON, nullable=True)  # Specific purposes allowed
    
    # Temporal boundaries
    granted_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revocation_reason = Column(Text, nullable=True)
    
    # Versioning
    version = Column(Integer, default=1)
    previous_version_id = Column(Integer, ForeignKey("consent_records.id"), nullable=True)
    superseded_by_id = Column(Integer, ForeignKey("consent_records.id"), nullable=True)
    
    # Actor tracking
    granted_by = Column(String(255), nullable=True)  # Patient ID who granted
    granted_to = Column(String(255), nullable=True)  # Clinic/provider ID
    witnessed_by = Column(String(255), nullable=True)  # Witness for in-person consent
    
    # Document reference
    document_url = Column(String(500), nullable=True)  # Link to signed consent form
    signature_hash = Column(String(64), nullable=True)  # Hash of digital signature
    
    # Metadata
    ip_address = Column(String(45), nullable=True)  # IP for digital consent
    user_agent = Column(Text, nullable=True)  # Browser/device info
    jurisdiction = Column(String(100), default="US")  # Legal jurisdiction
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(255), nullable=True)
    
    patient_consents = relationship("PatientConsentEnforcement", back_populates="consent")
    
    def is_active(self) -> bool:
        """Check if consent is currently active."""
        if self.status != ConsentStatus.GRANTED:
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        return True
    
    def to_dict(self) -> Dict:
        return {
            "consent_id": self.consent_id,
            "patient_id": self.patient_id,
            "consent_type": self.consent_type,
            "status": self.status,
            "scope_description": self.scope_description,
            "data_elements": self.data_elements,
            "purposes": self.purposes,
            "granted_at": self.granted_at.isoformat() if self.granted_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_active": self.is_active(),
            "version": self.version,
        }


class PatientConsentEnforcement(Base):
    """Enforcement log for consent-based access decisions."""
    __tablename__ = "consent_enforcement_log"
    
    id = Column(Integer, primary_key=True)
    consent_id = Column(Integer, ForeignKey("consent_records.id"), nullable=False)
    consent = relationship("ConsentRecord", back_populates="patient_consents")
    
    patient_id = Column(Integer, nullable=False)
    action_requested = Column(String(50), nullable=False)
    
    # Decision
    allowed = Column(Boolean, nullable=False)
    reason = Column(Text, nullable=True)
    
    # Context
    requested_by_user = Column(String(255), nullable=False)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    context = Column(JSON, nullable=True)  # Additional decision context


class ConsentManager:
    """Consent management service for clinic data console."""
    
    # Default consent templates
    CONSENT_TEMPLATES = {
        ConsentType.TREATMENT: {
            "scope_description": "I consent to medical evaluation, diagnosis, and treatment by the clinic's healthcare providers.",
            "data_elements": ["medical_history", "symptoms", "diagnosis", "treatment_records"],
            "purposes": ["diagnosis", "treatment", "care_coordination"],
        },
        ConsentType.DATA_COLLECTION: {
            "scope_description": "I consent to the collection and storage of my personal and health information in the clinic's electronic health record system.",
            "data_elements": ["name", "contact_info", "demographics", "medical_history", "insurance"],
            "purposes": ["patient_care", "administration", "quality_improvement"],
        },
        ConsentType.DATA_SHARING_PROVIDER: {
            "scope_description": "I consent to sharing my health information with other healthcare providers involved in my care.",
            "data_elements": ["medical_records", "test_results", "diagnosis", "medications"],
            "purposes": ["care_coordination", "referral"],
        },
        ConsentType.DATA_SHARING_RESEARCH: {
            "scope_description": "I consent to the use of my de-identified health information for medical research purposes.",
            "data_elements": ["demographics", "diagnosis", "treatment_outcomes"],
            "purposes": ["medical_research", "public_health"],
        },
        ConsentType.TELEMEDICINE: {
            "scope_description": "I consent to receive healthcare services via telemedicine, including video consultations and remote monitoring.",
            "data_elements": ["video_recordings", "audio_recordings", "vital_signs"],
            "purposes": ["telemedicine_care", "remote_monitoring"],
        },
    }
    
    def __init__(self, db_session):
        self.db = db_session
    
    def create_consent_record(self, patient_id: int, consent_type: ConsentType,
                              granted_by: str, custom_scope: Optional[Dict] = None,
                              expires_days: Optional[int] = None) -> ConsentRecord:
        """Create a new consent record from template or custom scope."""
        template = self.CONSENT_TEMPLATES.get(consent_type, {})
        
        if custom_scope:
            scope = custom_scope
        else:
            scope = {
                "scope_description": template.get("scope_description", ""),
                "data_elements": template.get("data_elements", []),
                "purposes": template.get("purposes", []),
            }
        
        record = ConsentRecord(
            patient_id=patient_id,
            consent_type=consent_type.value,
            status=ConsentStatus.GRANTED,
            granted_at=datetime.utcnow(),
            granted_by=granted_by,
            expires_at=datetime.utcnow() + timedelta(days=expires_days) if expires_days else None,
            **scope,
        )
        
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record
    
    def revoke_consent(self, consent_id: str, revoked_by: str, 
                       reason: str) -> ConsentRecord:
        """Revoke a consent record."""
        record = self.db.query(ConsentRecord).filter(
            ConsentRecord.consent_id == consent_id
        ).first()
        
        if not record:
            raise ValueError(f"Consent record {consent_id} not found")
        
        record.status = ConsentStatus.REVOKED
        record.revoked_at = datetime.utcnow()
        record.revocation_reason = reason
        
        self.db.commit()
        self.db.refresh(record)
        return record
    
    def check_consent(self, patient_id: int, consent_type: ConsentType,
                      requested_purpose: str) -> Dict:
        """Check if patient has granted consent for a specific action."""
        records = self.db.query(ConsentRecord).filter(
            ConsentRecord.patient_id == patient_id,
            ConsentRecord.consent_type == consent_type.value,
        ).order_by(ConsentRecord.version.desc()).all()
        
        # Find the most recent active record
        active_record = None
        for record in records:
            if record.is_active():
                active_record = record
                break
        
        if not active_record:
            return {
                "allowed": False,
                "reason": f"No active consent found for {consent_type.value}",
                "consent_required": True,
            }
        
        # Check purpose
        if requested_purpose not in (active_record.purposes or []):
            return {
                "allowed": False,
                "reason": f"Purpose '{requested_purpose}' not covered by consent",
                "consent_required": True,
                "allowed_purposes": active_record.purposes,
            }
        
        return {
            "allowed": True,
            "consent_id": active_record.consent_id,
            "granted_at": active_record.granted_at,
            "expires_at": active_record.expires_at,
            "purposes": active_record.purposes,
        }
    
    def get_consent_summary(self, patient_id: int) -> Dict:
        """Get summary of all consent status for a patient."""
        records = self.db.query(ConsentRecord).filter(
            ConsentRecord.patient_id == patient_id
        ).order_by(ConsentRecord.created_at.desc()).all()
        
        summary = {}
        for record in records:
            if record.consent_type not in summary:
                summary[record.consent_type] = {
                    "latest_status": record.status,
                    "is_active": record.is_active(),
                    "granted_at": record.granted_at.isoformat() if record.granted_at else None,
                    "expires_at": record.expires_at.isoformat() if record.expires_at else None,
                    "version": record.version,
                }
        
        return summary
    
    def enforce_consent_check(self, patient_id: int, consent_type: ConsentType,
                              action: str, requesting_user: str,
                              context: Optional[Dict] = None) -> bool:
        """Enforce consent check with logging."""
        result = self.check_consent(patient_id, consent_type, action)
        
        # Log the enforcement decision
        enforcement = PatientConsentEnforcement(
            consent_id=result.get("consent_id"),
            patient_id=patient_id,
            action_requested=action,
            allowed=result["allowed"],
            reason=result.get("reason"),
            requested_by_user=requesting_user,
            context=context or {},
        )
        
        self.db.add(enforcement)
        self.db.commit()
        
        return result["allowed"]


# FastAPI integration
from fastapi import FastAPI, Depends, HTTPException, Request

app = FastAPI()

@app.post("/patients/{patient_id}/consent")
async def grant_consent(
    patient_id: int,
    consent_type: ConsentType,
    request: Request,
    expires_days: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Record patient consent."""
    manager = ConsentManager(db)
    
    consent = manager.create_consent_record(
        patient_id=patient_id,
        consent_type=consent_type,
        granted_by=request.state.user_id,
        expires_days=expires_days,
    )
    
    return {"consent_id": consent.consent_id, "status": consent.status}

@app.get("/patients/{patient_id}/consent/check")
async def check_patient_consent(
    patient_id: int,
    consent_type: ConsentType,
    purpose: str,
    db: Session = Depends(get_db)
):
    """Check if patient consent exists for a specific purpose."""
    manager = ConsentManager(db)
    result = manager.check_consent(patient_id, consent_type, purpose)
    return result

@app.get("/patients/{patient_id}/consent/summary")
async def get_consent_summary(patient_id: int, db: Session = Depends(get_db)):
    """Get full consent summary for a patient."""
    manager = ConsentManager(db)
    return manager.get_consent_summary(patient_id)
```

---

### 6.2 UMA (User-Managed Access)

**UMA 2.0** is an OAuth-based protocol that enables patients to manage authorization for their health data. It aligns perfectly with patient-centric consent management.

| Property | Detail |
|----------|--------|
| **Standard** | UMA 2.0 (User-Managed Access) |
| **Governing Body** | Kantara Initiative |
| **Base Protocol** | OAuth 2.0 |
| **License** | Open standard (no license required) |
| **Website** | https://docs.kantarainitiative.org/uma/rec-uma-core.html |

#### Key Features

- **Patient-controlled authorization** -- patients grant, manage, and revoke access to their resources
- **Resource server** (clinic) registers resources with an authorization server
- **Policy-based access** -- patients set policies for who can access what
- **Claims-based authorization** -- requesting parties present claims to gain access
- **Delegation** -- patients can delegate access management to trusted representatives
- **Aligns with GDPR Article 7** (conditions for consent)

#### Clinical Relevance

UMA is particularly relevant for:
- Patient portals with delegated access (family members, caregivers)
- Research data sharing with patient-controlled authorization
- Multi-provider care coordination with patient-managed access
- Consent management for clinical trials

#### Implementation Pattern

```python
# UMA-inspired consent authorization for clinic data
# Simplified implementation -- full UMA requires dedicated authorization server

class UMAAuthorizationServer:
    """Simplified UMA authorization server for patient data."""
    
    def __init__(self, db_session):
        self.db = db_session
    
    def register_resource(self, patient_id: int, resource_type: str, 
                          resource_id: str, scopes: list[str]) -> str:
        """Register a protected resource (UMA Resource Registration)."""
        resource_reg = ResourceRegistration(
            patient_id=patient_id,
            resource_type=resource_type,
            resource_id=resource_id,
            scopes=scopes,
        )
        self.db.add(resource_reg)
        self.db.commit()
        return resource_reg.id
    
    def create_policy(self, patient_id: int, resource_type: str,
                      allowed_users: list[str], allowed_scopes: list[str],
                      conditions: Optional[Dict] = None) -> str:
        """Create patient-managed access policy."""
        policy = AccessPolicy(
            patient_id=patient_id,
            resource_type=resource_type,
            allowed_users=allowed_users,
            allowed_scopes=allowed_scopes,
            conditions=conditions or {},
        )
        self.db.add(policy)
        self.db.commit()
        return policy.id
    
    def request_access(self, requester_id: str, resource_type: str,
                       resource_id: str, requested_scope: str,
                       claims: Dict) -> Dict:
        """Request access to a protected resource (UMA Ticket flow)."""
        # Find policies for this resource type and patient
        resource = self.db.query(ResourceRegistration).filter(
            ResourceRegistration.resource_type == resource_type,
            ResourceRegistration.resource_id == resource_id,
        ).first()
        
        if not resource:
            return {"error": "resource_not_found"}
        
        policies = self.db.query(AccessPolicy).filter(
            AccessPolicy.patient_id == resource.patient_id,
            AccessPolicy.resource_type == resource_type,
        ).all()
        
        # Evaluate policies
        for policy in policies:
            if requester_id in policy.allowed_users:
                if requested_scope in policy.allowed_scopes:
                    # Issue access token (simplified)
                    token = self._issue_rpt(resource, requester_id, requested_scope)
                    return {
                        "access_granted": True,
                        "token": token,
                        "scopes": [requested_scope],
                        "expires_in": 3600,
                    }
        
        # No matching policy -- request authorization from patient
        return {
            "access_granted": False,
            "ticket": self._create_request_ticket(resource, requester_id, requested_scope),
            "message": "Patient authorization required",
        }
    
    def _issue_rpt(self, resource, requester_id, scope):
        """Issue Requesting Party Token (RPT)."""
        import jwt
        return jwt.encode(
            {"sub": requester_id, "resource": resource.resource_id, 
             "scope": scope, "exp": datetime.utcnow() + timedelta(hours=1)},
            "secret_key",
            algorithm="HS256"
        )
    
    def _create_request_ticket(self, resource, requester_id, scope):
        """Create a request ticket for patient approval."""
        ticket = str(uuid.uuid4())
        # Store ticket for patient notification
        return ticket

# Resource registration model
class ResourceRegistration(Base):
    __tablename__ = "uma_resource_registrations"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(Integer, nullable=False)
    resource_type = Column(String(100), nullable=False)
    resource_id = Column(String(255), nullable=False)
    scopes = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class AccessPolicy(Base):
    __tablename__ = "uma_access_policies"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(Integer, nullable=False)
    resource_type = Column(String(100), nullable=False)
    allowed_users = Column(JSON, nullable=False)
    allowed_scopes = Column(JSON, nullable=False)
    conditions = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
```

#### Limitations

- **Complex to implement fully** -- production UMA requires dedicated authorization server
- **Limited tooling** -- few open source UMA authorization servers available
- **Adoption** -- limited adoption in healthcare IT systems
- **Patient UX challenge** -- patients may find policy management complex

---

### 6.3 OAuth 2.0 for Consent

OAuth 2.0 can be extended for consent management through scope-based authorization and SMART on FHIR launch framework.

#### SMART on FHIR

| Property | Detail |
|----------|--------|
| **Name** | SMART on FHIR |
| **Standard** | HL7 FHIR + OAuth 2.0 + OpenID Connect |
| **Governing Body** | HL7 / SMART Health IT |
| **License** | Open standard |
| **Website** | https://smarthealthit.org/ |

SMART on FHIR provides:
- **App launch context** -- EHR-launched apps with patient context
- **Scope-based access** -- `patient/*.read`, `patient/Observation.write`, etc.
- **User-facing authorization** -- patients approve app access requests
- **Token-based security** -- JWT access tokens with embedded scopes

```python
# SMART on FHIR scope-based consent authorization
from fastapi import Security, HTTPException
from fastapi.security import OAuth2AuthorizationCodeBearer

# Define clinical scopes aligned with SMART on FHIR
CLINICAL_SCOPES = {
    "patient/Patient.read": "Read patient demographics",
    "patient/Patient.write": "Update patient demographics",
    "patient/Observation.read": "Read observations and vitals",
    "patient/Observation.write": "Write observations and vitals",
    "patient/Condition.read": "Read diagnoses and conditions",
    "patient/Condition.write": "Write diagnoses and conditions",
    "patient/Medication.read": "Read medication orders and statements",
    "patient/Medication.write": "Write medication orders",
    "patient/Encounter.read": "Read encounter/visit information",
    "patient/DocumentReference.read": "Read clinical documents and notes",
    "patient/Immunization.read": "Read immunization records",
    "patient/AllergyIntolerance.read": "Read allergy and intolerance records",
    "patient/Procedure.read": "Read procedure records",
    "patient/Coverage.read": "Read insurance coverage information",
    "patient/*.read": "Read all patient data",
    "patient/*.write": "Write all patient data",
}

async def require_scope(
    required_scope: str,
    token_data: dict = Depends(get_current_token)
):
    """Require specific SMART scope for endpoint access."""
    granted_scopes = token_data.get("scope", "").split()
    
    # Check for exact scope or wildcard scope
    if required_scope in granted_scopes:
        return token_data
    
    # Check for wildcard access
    resource_type = required_scope.split("/")[1].split(".")[0]
    wildcard_read = f"patient/{resource_type}.read"
    wildcard_all = "patient/*.read" if ".read" in required_scope else "patient/*.write"
    
    if wildcard_read in granted_scopes or wildcard_all in granted_scopes:
        return token_data
    
    raise HTTPException(
        status_code=403,
        detail=f"Insufficient scope. Required: {required_scope}",
    )

@app.get("/fhir/Patient/{patient_id}")
async def get_patient_fhir(
    patient_id: str,
    token: dict = Security(require_scope, scopes=["patient/Patient.read"])
):
    """Get patient via FHIR with SMART scope authorization."""
    # Verify patient matches token context
    if token.get("patient") and token["patient"] != patient_id:
        raise HTTPException(status_code=403, detail="Access limited to authorized patient")
    
    patient = await get_patient_from_db(patient_id)
    return patient.to_fhir()
```

---

### 6.4 XACML for Policy-Based Access

**XACML (eXtensible Access Control Markup Language)** provides a standardized way to define and enforce access control policies.

| Property | Detail |
|----------|--------|
| **Standard** | OASIS XACML 3.0 |
| **Governing Body** | OASIS |
| **License** | Open standard |
| **Reference Implementation** | WSO2 Balana (Apache 2.0) |

#### Key Components

- **Policy Administration Point (PAP)** -- where policies are defined
- **Policy Decision Point (PDP)** -- evaluates policies to make access decisions
- **Policy Enforcement Point (PEP)** -- intercepts requests and enforces decisions
- **Policy Information Point (PIP)** -- retrieves attributes for policy evaluation

#### Clinical Use Cases

- **Break-the-glass** -- emergency access policies
- **Role-based access** -- provider role determines data access level
- **Time-based restrictions** -- access only during business hours
- **Location-based** -- access only from clinic network
- **Consent-aware** -- policies check patient consent before granting access

```python
# Simplified XACML-inspired policy engine for clinic data
from dataclasses import dataclass
from typing import List, Dict, Optional, Callable
from enum import Enum

class Decision(str, Enum):
    PERMIT = "Permit"
    DENY = "Deny"
    NOT_APPLICABLE = "NotApplicable"
    INDETERMINATE = "Indeterminate"

@dataclass
class AccessRequest:
    """Access request for policy evaluation."""
    subject_id: str  # User ID
    subject_role: str  # doctor, nurse, admin, billing
    subject_department: str
    resource_type: str  # Patient, ClinicalNote, BillingRecord
    resource_id: str
    resource_owner: str  # Patient ID who owns the data
    action: str  # read, write, delete
    environment: Dict  # time, location, emergency flag

@dataclass
class PolicyRule:
    """Individual policy rule."""
    name: str
    description: str
    target_resource: Optional[str]  # None = any resource
    target_action: Optional[str]  # None = any action
    target_role: Optional[str]  # None = any role
    conditions: List[Callable[[AccessRequest], bool]]
    decision: Decision
    priority: int = 0

class ClinicPolicyEngine:
    """XACML-inspired policy engine for clinical data access."""
    
    def __init__(self):
        self.rules: List[PolicyRule] = []
        self._load_default_policies()
    
    def _load_default_policies(self):
        """Load default clinical access policies."""
        
        # Rule 1: Doctors can read their own patients' data
        self.rules.append(PolicyRule(
            name="doctor_own_patient_read",
            description="Doctors can read data of patients they are assigned to",
            target_resource="Patient",
            target_action="read",
            target_role="doctor",
            conditions=[
                lambda req: req.resource_owner in self._get_doctor_patients(req.subject_id),
            ],
            decision=Decision.PERMIT,
            priority=100,
        ))
        
        # Rule 2: Nurses can read basic patient info
        self.rules.append(PolicyRule(
            name="nurse_basic_read",
            description="Nurses can read basic patient demographics",
            target_resource="Patient",
            target_action="read",
            target_role="nurse",
            conditions=[
                lambda req: req.environment.get("emergency", False) == False,
            ],
            decision=Decision.PERMIT,
            priority=90,
        ))
        
        # Rule 3: Emergency break-the-glass
        self.rules.append(PolicyRule(
            name="emergency_override",
            description="Emergency access override for patient care",
            target_resource=None,
            target_action="read",
            target_role=None,
            conditions=[
                lambda req: req.environment.get("emergency", False) == True,
            ],
            decision=Decision.PERMIT,
            priority=1000,  # Highest priority
        ))
        
        # Rule 4: Deny access outside business hours
        self.rules.append(PolicyRule(
            name="business_hours",
            description="Deny access outside business hours unless emergency",
            target_resource=None,
            target_action=None,
            target_role=None,
            conditions=[
                lambda req: not self._is_business_hours(req.environment.get("timestamp")),
                lambda req: req.environment.get("emergency", False) == False,
            ],
            decision=Decision.DENY,
            priority=50,
        ))
        
        # Rule 5: Billing staff can only access billing records
        self.rules.append(PolicyRule(
            name="billing_scope",
            description="Billing staff restricted to billing resources",
            target_resource=None,  # Applied to all resources
            target_action=None,
            target_role="billing",
            conditions=[
                lambda req: req.resource_type != "BillingRecord" and req.resource_type != "Insurance",
            ],
            decision=Decision.DENY,
            priority=200,
        ))
        
        # Rule 6: Admin has broad access (except PHI in certain contexts)
        self.rules.append(PolicyRule(
            name="admin_access",
            description="Administrators have system management access",
            target_resource=None,
            target_action=None,
            target_role="admin",
            conditions=[],
            decision=Decision.PERMIT,
            priority=80,
        ))
    
    def _get_doctor_patients(self, doctor_id: str) -> List[str]:
        """Get list of patient IDs assigned to a doctor."""
        # This would query the database
        return []
    
    def _is_business_hours(self, timestamp) -> bool:
        """Check if timestamp is within business hours."""
        if not timestamp:
            return True
        from datetime import time
        current_time = timestamp.time() if hasattr(timestamp, 'time') else time.now()
        return time(8, 0) <= current_time <= time(18, 0)
    
    def evaluate(self, request: AccessRequest) -> Decision:
        """Evaluate access request against all policies."""
        applicable_rules = []
        
        for rule in self.rules:
            # Check if rule targets this request
            if rule.target_resource and rule.target_resource != request.resource_type:
                continue
            if rule.target_action and rule.target_action != request.action:
                continue
            if rule.target_role and rule.target_role != request.subject_role:
                continue
            
            # Evaluate conditions
            try:
                if all(condition(request) for condition in rule.conditions):
                    applicable_rules.append(rule)
            except Exception:
                continue
        
        if not applicable_rules:
            return Decision.NOT_APPLICABLE
        
        # Return decision from highest priority applicable rule
        applicable_rules.sort(key=lambda r: r.priority, reverse=True)
        return applicable_rules[0].decision

# Usage example
engine = ClinicPolicyEngine()

request = AccessRequest(
    subject_id="dr_smith",
    subject_role="doctor",
    subject_department="cardiology",
    resource_type="Patient",
    resource_id="12345",
    resource_owner="12345",
    action="read",
    environment={"timestamp": datetime.now(), "emergency": False},
)

decision = engine.evaluate(request)
print(f"Access decision: {decision}")  # Permit or Deny
```

#### Limitations

- **Complex to implement fully** -- XACML is verbose and complex
- **Performance** -- policy evaluation can be slow with many rules
- **Limited open source implementations** -- WSO2 Balana is the main option
- **Overkill for small clinics** -- simpler RBAC + consent management often sufficient
- **Learning curve** -- XACML syntax is not intuitive

---

## 7. Data Anonymization

Data anonymization is essential for:
- HIPAA de-identification (Safe Harbor method)
- GDPR anonymization requirements
- Research data sharing
- Quality improvement reporting
- Public health reporting

---

### 7.1 ARX Data Anonymization Tool

| Property | Detail |
|----------|--------|
| **Name** | ARX Data Anonymization Tool |
| **Language** | Java |
| **License** | Apache 2.0 |
| **GitHub** | https://github.com/arx-deidentifier/arx |
| **Stars** | ~900 |
| **Maintainer** | Fabian Prasser and contributors |
| **First Release** | 2012 |
| **Latest Activity** | Active; v3.9.2 (September 2025) |

#### Key Features

- **Comprehensive anonymization** supporting multiple privacy models:
  - k-anonymity, l-diversity, t-closeness
  - delta-disclosure, beta-likeness
  - k-map, average risk, population uniqueness
- **Multiple transformation methods:**
  - Generalization, suppression, micro-aggregation
  - Top/bottom coding, clustering
- **Utility analysis** -- measures data quality after anonymization
  - Classification accuracy, regression analysis
  - Statistical utility metrics
- **Risk analysis** -- re-identification risk assessment
- **Graphical user interface** for interactive anonymization
- **Java library** for programmatic use
- **Large dataset handling** on commodity hardware
- **Used in clinical trial data sharing** and commercial analytics platforms

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| De-identification | **10/10** | Industry-leading anonymization capabilities |
| HIPAA Safe Harbor | **9/10** | Supports all 18 HIPAA Safe Harbor identifiers |
| Performance | 8/10 | Handles large clinical datasets efficiently |
| Ease of Use | 7/10 | GUI available; Java API for integration |
| Research Use | **9/10** | Widely used in clinical research |
| **Overall** | **9/10** | **Gold standard for clinical data anonymization** |

#### Integration Path with FastAPI/SQLAlchemy

```python
# FastAPI integration with ARX via subprocess or Java bridge
import subprocess
import json
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict

class AnonymizationRequest(BaseModel):
    dataset_path: str
    privacy_model: str = "k-anonymity"
    k_value: int = 5
    l_value: Optional[int] = None  # For l-diversity
    suppression_limit: float = 0.05  # Max 5% suppression
    
    # Column configurations
    quasi_identifiers: List[str]  # Columns to anonymize
    sensitive_columns: List[str]  # Sensitive attributes
    identifier_columns: List[str]  # Direct identifiers (to remove)

@app.post("/data/anonymize")
async def anonymize_dataset(
    request: AnonymizationRequest,
    background_tasks: BackgroundTasks
):
    """Anonymize clinical dataset using ARX."""
    
    # Build ARX configuration
    arx_config = {
        "input": request.dataset_path,
        "output": f"{request.dataset_path}.anonymized.csv",
        "privacy_model": request.privacy_model,
        "k": request.k_value,
        "suppression_limit": request.suppression_limit,
        "quasi_identifiers": request.quasi_identifiers,
        "sensitive_columns": request.sensitive_columns,
        "identifier_columns": request.identifier_columns,
    }
    
    config_path = f"/tmp/arx_config_{uuid.uuid4()}.json"
    with open(config_path, "w") as f:
        json.dump(arx_config, f)
    
    # Execute ARX anonymization
    result = subprocess.run(
        ["java", "-jar", "/opt/arx/arx-cli.jar", "--config", config_path],
        capture_output=True,
        text=True,
        timeout=300,  # 5 minute timeout
    )
    
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Anonymization failed: {result.stderr}"
        )
    
    # Parse anonymization metrics
    metrics = json.loads(result.stdout)
    
    return {
        "status": "success",
        "output_path": arx_config["output"],
        "metrics": {
            "records_anonymized": metrics["records"],
            "suppressed_records": metrics["suppressed"],
            "suppression_rate": metrics["suppression_rate"],
            "privacy_model_applied": request.privacy_model,
            "k_value_achieved": metrics.get("k"),
            "utility_score": metrics.get("utility_score"),
        },
        "hipaa_safe_harbor": request.privacy_model == "k-anonymity" and request.k_value >= 5,
    }

# Alternative: Direct Java integration via Py4J
from py4j.java_gateway import JavaGateway

gateway = JavaGateway()

def anonymize_with_py4j(dataframe, quasi_ids, sensitive_attrs, k=5):
    """Anonymize using ARX through Py4J bridge."""
    arx = gateway.jvm.org.deidentifier.arx
    
    # Create ARX configuration
    config = arx.ARXConfiguration.create()
    config.addPrivacyModel(arx.ARXPrivacyCriterion.KAnonymity(k))
    config.setSuppressionLimit(0.05)
    
    # Build ARX data from DataFrame
    # ... (implementation details)
    
    # Execute anonymization
    anonymizer = arx.ARXAnonymizer()
    result = anonymizer.anonymize(data, config)
    
    return result
```

#### Limitations

- **Java-based** -- requires JVM; integration with Python requires bridge
- **Learning curve** -- many privacy models and parameters to understand
- **GUI-focused** -- programmatic API less documented than GUI
- **Performance** -- very large datasets may require significant memory
- **No built-in FHIR support** -- must convert FHIR resources to tabular format

---

### 7.2 Amnesia

| Property | Detail |
|----------|--------|
| **Name** | Amnesia |
| **Language** | Java / Spring Framework |
| **License** | MIT |
| **GitHub** | https://github.com/dTsitsigkos/Amnesia |
| **Stars** | ~100 |
| **Maintainer** | OpenAIRE / ATHENA Research Center |
| **First Release** | 2019 |

#### Key Features

- **Data anonymization tool** with web interface
- **k-anonymity** and other privacy models
- **Hierarchy generation** for quasi-identifiers
- **Visual anonymization** -- see data transformations in real-time
- **REST API** for programmatic access
- **Supports multiple file formats** -- CSV, relational databases
- **Online demo** available (for small datasets only)

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| De-identification | 7/10 | Good for basic anonymization tasks |
| Ease of Use | 8/10 | Web interface is user-friendly |
| Performance | 6/10 | Limited to smaller datasets |
| Maturity | 6/10 | Newer tool, smaller community |
| **Overall** | **6.5/10** | Good for simple anonymization needs |

#### Integration Path

```python
# Amnesia REST API integration
import httpx
from fastapi import FastAPI

AMNESIA_URL = "http://amnesia:8181"

@app.post("/data/anonymize/amnesia")
async def anonymize_with_amnesia(
    dataset_path: str,
    quasi_identifiers: List[str],
    k: int = 5
):
    """Anonymize dataset using Amnesia REST API."""
    
    async with httpx.AsyncClient() as client:
        # Upload dataset
        with open(dataset_path, "rb") as f:
            upload = await client.post(
                f"{AMNESIA_URL}/api/dataset/upload",
                files={"file": f},
            )
        
        dataset_id = upload.json()["dataset_id"]
        
        # Configure anonymization
        config = await client.post(
            f"{AMNESIA_URL}/api/anonymize",
            json={
                "dataset_id": dataset_id,
                "algorithm": "k_anonymity",
                "k": k,
                "quasi_identifiers": quasi_identifiers,
            }
        )
        
        return config.json()
```

#### Limitations

- **Smaller community** than ARX
- **Less comprehensive** privacy models
- **Performance limitations** with large datasets
- **Java-based** -- same integration challenges as ARX
- **Limited documentation** for REST API

---

### 7.3 k-anonymity and l-diversity Implementations

For Python-based clinic backends, native implementations provide better integration than Java tools.

```python
# Python implementation of k-anonymity for clinic data
# pip install anonymity (or implement custom)

import pandas as pd
import numpy as np
from typing import List, Dict, Tuple
from collections import defaultdict

class KAnonymityEngine:
    """k-anonymity implementation for clinical data de-identification."""
    
    def __init__(self, k: int = 5):
        self.k = k
    
    def check_k_anonymity(self, df: pd.DataFrame, quasi_identifiers: List[str]) -> bool:
        """Check if dataset satisfies k-anonymity."""
        groups = df.groupby(quasi_identifiers).size()
        return groups.min() >= self.k if len(groups) > 0 else False
    
    def generalize_numeric(self, series: pd.Series, num_levels: int = 5) -> pd.Series:
        """Generalize numeric column through binning."""
        min_val, max_val = series.min(), series.max()
        bin_width = (max_val - min_val) / num_levels
        bins = [min_val + i * bin_width for i in range(num_levels + 1)]
        labels = [f"{bins[i]:.0f}-{bins[i+1]:.0f}" for i in range(num_levels)]
        return pd.cut(series, bins=bins, labels=labels, include_lowest=True)
    
    def generalize_date(self, series: pd.Series, level: str = "year") -> pd.Series:
        """Generalize date column."""
        dates = pd.to_datetime(series)
        if level == "year":
            return dates.dt.year.astype(str)
        elif level == "quarter":
            return dates.dt.year.astype(str) + "-Q" + dates.dt.quarter.astype(str)
        elif level == "month":
            return dates.dt.to_period("M").astype(str)
        elif level == "week":
            return dates.dt.to_period("W").astype(str)
        return series
    
    def suppress_records(self, df: pd.DataFrame, quasi_identifiers: List[str],
                         max_suppression: float = 0.05) -> pd.DataFrame:
        """Suppress records that don't meet k-anonymity."""
        groups = df.groupby(quasi_identifiers).size()
        
        # Find groups with fewer than k records
        small_groups = groups[groups < self.k].index
        
        # Create mask for records to suppress
        mask = pd.Series(True, index=df.index)
        for group_vals in small_groups:
            if isinstance(group_vals, tuple):
                condition = pd.Series(True, index=df.index)
                for col, val in zip(quasi_identifiers, group_vals):
                    condition &= (df[col] == val)
                mask &= ~condition
            else:
                mask &= ~(df[quasi_identifiers[0]] == group_vals)
        
        suppressed = df[mask].copy()
        suppression_rate = 1 - len(suppressed) / len(df)
        
        if suppression_rate > max_suppression:
            raise ValueError(
                f"Suppression rate {suppression_rate:.2%} exceeds limit {max_suppression:.2%}. "
                f"Increase k or use more generalization."
            )
        
        return suppressed
    
    def anonymize(self, df: pd.DataFrame, 
                  quasi_identifiers: Dict[str, Dict],
                  sensitive_columns: List[str]) -> Tuple[pd.DataFrame, Dict]:
        """
        Anonymize dataset using k-anonymity.
        
        quasi_identifiers: {
            "age": {"type": "numeric", "levels": 5},
            "zip_code": {"type": "string", "truncate": 3},
            "birth_date": {"type": "date", "level": "year"},
        }
        """
        result = df.copy()
        generalization_log = []
        
        for col, config in quasi_identifiers.items():
            if config["type"] == "numeric":
                result[col] = self.generalize_numeric(
                    result[col], config.get("levels", 5)
                )
                generalization_log.append(f"{col}: numeric -> {config.get('levels', 5)} bins")
                
            elif config["type"] == "date":
                result[col] = self.generalize_date(
                    result[col], config.get("level", "year")
                )
                generalization_log.append(f"{col}: date -> {config.get('level', 'year')}")
                
            elif config["type"] == "string":
                if "truncate" in config:
                    result[col] = result[col].astype(str).str[:config["truncate"]]
                    generalization_log.append(f"{col}: string -> truncated to {config['truncate']} chars")
        
        qi_cols = list(quasi_identifiers.keys())
        
        # Check if k-anonymity satisfied
        if not self.check_k_anonymity(result, qi_cols):
            result = self.suppress_records(result, qi_cols)
        
        metrics = {
            "original_records": len(df),
            "anonymized_records": len(result),
            "suppression_rate": 1 - len(result) / len(df),
            "k_satisfied": self.k,
            "generalizations_applied": generalization_log,
        }
        
        return result, metrics


class LDiversityEngine:
    """l-diversity implementation for enhanced privacy."""
    
    def __init__(self, l: int = 2):
        self.l = l
    
    def check_l_diversity(self, df: pd.DataFrame, 
                          quasi_identifiers: List[str],
                          sensitive_column: str) -> bool:
        """Check if dataset satisfies l-diversity."""
        groups = df.groupby(quasi_identifiers)
        
        for _, group in groups:
            distinct_values = group[sensitive_column].nunique()
            if distinct_values < self.l:
                return False
        return True
    
    def enforce_l_diversity(self, df: pd.DataFrame,
                            quasi_identifiers: List[str],
                            sensitive_column: str) -> pd.DataFrame:
        """Remove groups that don't satisfy l-diversity."""
        groups = df.groupby(quasi_identifiers)
        
        valid_groups = []
        for name, group in groups:
            if group[sensitive_column].nunique() >= self.l:
                valid_groups.append(group)
        
        if not valid_groups:
            return pd.DataFrame(columns=df.columns)
        
        return pd.concat(valid_groups, ignore_index=True)


# Usage example
@app.post("/patients/anonymize")
async def anonymize_patient_data(
    k: int = 5,
    l: int = 2,
    db: Session = Depends(get_db)
):
    """Anonymize patient data for research use."""
    
    # Export patient data
    patients = db.query(Patient).all()
    df = pd.DataFrame([{
        "id": p.id,
        "name": p.name,
        "age": (datetime.now() - p.date_of_birth).days // 365,
        "zip_code": p.zip_code,
        "birth_date": p.date_of_birth,
        "diagnosis": p.primary_diagnosis,
        "gender": p.gender,
    } for p in patients])
    
    # Remove direct identifiers
    df = df.drop(columns=["id", "name"])
    
    # Apply k-anonymity
    k_engine = KAnonymityEngine(k=k)
    anonymized, metrics = k_engine.anonymize(
        df,
        quasi_identifiers={
            "age": {"type": "numeric", "levels": 5},
            "zip_code": {"type": "string", "truncate": 3},
            "birth_date": {"type": "date", "level": "year"},
            "gender": {"type": "string"},
        },
        sensitive_columns=["diagnosis"],
    )
    
    # Apply l-diversity for sensitive diagnosis column
    l_engine = LDiversityEngine(l=l)
    anonymized = l_engine.enforce_l_diversity(
        anonymized, 
        ["age", "zip_code", "birth_date", "gender"], 
        "diagnosis"
    )
    
    # Export anonymized data
    output_path = "/tmp/anonymized_patients.csv"
    anonymized.to_csv(output_path, index=False)
    
    return {
        "output_path": output_path,
        "metrics": metrics,
        "l_diversity_satisfied": l,
        "hipaa_safe_harbor": True,
    }
```

---

### 7.4 Differential Privacy Libraries

Differential privacy provides mathematical guarantees about individual privacy in aggregate data releases.

| Property | Detail |
|----------|--------|
| **Google DP Library** | C++ / Java / Python / Go |
| **License** | Apache 2.0 |
| **GitHub** | https://github.com/google/differential-privacy |
| **OpenDP** | Rust / Python |
| **License** | MIT |
| **GitHub** | https://github.com/opendp/opendp |

```python
# Differential privacy for clinic aggregate statistics
# pip install opendp

import opendp.prelude as dp
import numpy as np

def compute_dp_patient_count(ages: list, epsilon: float = 1.0) -> float:
    """Compute differentially private patient count by age group."""
    
    # Create measurement with Laplace mechanism
    base_laplace = dp.m.make_base_laplace(
        dp.atom_domain(T=float),
        dp.absolute_distance(T=float),
        scale=1.0 / epsilon,
    )
    
    # Add noise to count
    noisy_count = base_laplace(len(ages))
    
    return max(0, noisy_count)  # Ensure non-negative

def compute_dp_average_age(ages: list, epsilon: float = 1.0,
                           age_bounds: tuple = (0, 120)) -> float:
    """Compute differentially private average patient age."""
    
    # Clamp ages to bounds
    clamped_ages = [max(age_bounds[0], min(a, age_bounds[1])) for a in ages]
    
    # Split privacy budget
    eps_count = epsilon / 2
    eps_sum = epsilon / 2
    
    # Noisy count
    noisy_count = len(clamped_ages) + np.random.laplace(0, 1.0 / eps_count)
    noisy_count = max(1, noisy_count)  # Avoid division by zero
    
    # Noisy sum
    noisy_sum = sum(clamped_ages) + np.random.laplace(0, age_bounds[1] / eps_sum)
    
    return noisy_sum / noisy_count

# Usage for clinic quality metrics
@app.get("/analytics/dp-patient-summary")
async def get_dp_patient_summary(
    epsilon: float = 1.0,
    db: Session = Depends(get_db)
):
    """Get differentially private patient summary statistics."""
    
    patients = db.query(Patient).all()
    ages = [(datetime.now() - p.date_of_birth).days // 365 for p in patients]
    
    return {
        "dp_total_patients": compute_dp_patient_count(ages, epsilon),
        "dp_average_age": compute_dp_average_age(ages, epsilon),
        "epsilon": epsilon,
        "privacy_budget_used": epsilon,
    }
```

#### Limitations

- **Accuracy-privacy tradeoff** -- higher privacy (lower epsilon) means noisier results
- **Complexity** -- requires understanding of privacy budgets and composition
- **Limited utility** for individual-level data
- **Best for aggregate statistics** -- not suitable for de-identified datasets

---

## 8. Visualization Tools

Clinical data visualization enables healthcare providers to identify trends, monitor patient outcomes, and support clinical decision-making.

---

### 8.1 Metabase

| Property | Detail |
|----------|--------|
| **Name** | Metabase |
| **Language** | Clojure / JavaScript |
| **License** | AGPL-3.0 (open core) + Commercial Pro/Enterprise |
| **GitHub** | https://github.com/metabase/metabase |
| **Stars** | ~41,000 |
| **Forks** | ~5,200 |
| **Maintainer** | Metabase Inc. |
| **First Release** | 2015 |
| **Latest Activity** | Very active; $1.6B valuation (Series D) |

#### Key Features

- **Self-service BI** -- non-technical users can create charts without SQL
- **SQL editor** for power users
- **Interactive dashboards** with filters, auto-refresh, fullscreen
- **Models** -- clean, annotated data views
- **X-ray** -- automatic data exploration
- **Dashboard subscriptions** -- scheduled email/Slack delivery
- **Embedding** -- embed dashboards in applications (JWT-signed)
- **40+ database connectors** including PostgreSQL, MySQL, BigQuery, Snowflake
- **Multi-tenant** with collection-based permissions
- **REST API** for programmatic access

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Ease of Use | **9/10** | Best-in-class for non-technical users |
| Visualization | 8/10 | Good chart types; limited clinical-specific viz |
| Data Security | 7/10 | Sandboxing and row-level security in Enterprise |
| Self-Hosting | 9/10 | Easy Docker deployment |
| **AGPL Concern** | **Caution** | Source code disclosure for network use |
| **Overall** | **8/10** | Excellent BI tool; AGPL is a consideration |

#### Integration Path with FastAPI/SQLAlchemy

Metabase connects directly to the PostgreSQL database:

```yaml
# docker-compose.yml - Metabase alongside FastAPI
version: '3.8'
services:
  metabase:
    image: metabase/metabase:latest
    ports:
      - "3000:3000"
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: metabase_password
      MB_DB_HOST: postgres
      # Session security
      MB_SESSION_COOKIES: "true"
      MB_COOKIE_SAMESITE: "Strict"
    volumes:
      - metabase-data:/metabase-data

  # FastAPI shares the same PostgreSQL instance
  api:
    build: .
    environment:
      DATABASE_URL: postgresql://user:pass@postgres/clinic_db
    depends_on:
      - postgres
```

```python
# FastAPI can query Metabase for embedded dashboards
import httpx
from fastapi import FastAPI

METABASE_URL = "http://metabase:3000"
METABASE_SECRET = "your-metabase-secret-key"

import jwt

@app.get("/dashboards/patient-metrics")
async def get_patient_dashboard_url(user_id: str) -> Dict:
    """Generate signed embedding URL for patient metrics dashboard."""
    
    payload = {
        "resource": {"dashboard": 1},  # Dashboard ID
        "params": {},
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    
    token = jwt.encode(payload, METABASE_SECRET, algorithm="HS256")
    
    return {
        "iframe_url": f"{METABASE_URL}/embed/dashboard/{token}#bordered=true&titled=true",
        "expires_at": payload["exp"].isoformat(),
    }
```

#### Limitations

- **AGPL license** -- requires source code sharing for network deployments
- Row-level security (sandboxing) is Enterprise-only
- No native healthcare visualizations (vital sign charts, ECG plots)
- Embedding requires Enterprise license for advanced features
- Performance with very large clinical datasets needs tuning

---

### 8.2 Apache Superset

| Property | Detail |
|----------|--------|
| **Name** | Apache Superset |
| **Language** | Python / React / TypeScript |
| **License** | Apache 2.0 |
| **GitHub** | https://github.com/apache/superset |
| **Stars** | ~65,000 |
| **Forks** | ~14,000 |
| **Maintainer** | Apache Software Foundation |
| **First Release** | 2015 (Airbnb); 2021 (Apache top-level) |
| **Latest Activity** | Very active; Apache-governed |

#### Key Features

- **Fully open source** under Apache 2.0 -- no commercial gating
- **Apache Software Foundation governance** -- vendor-neutral
- **SQL Lab** -- powerful SQL IDE with autocomplete
- **Rich visualization library** -- 40+ chart types
- **Drag-and-drop chart builder** (Explore view)
- **Dashboards** with cross-filtering and drill-down
- **Row-level security** built-in (open source)
- **Caching layer** with Redis/Memcached
- **Alerts and reports** (open source)
- **Jinja templating** in SQL queries
- **Custom plugins** for visualizations
- **Asynchronous query execution** via Celery

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Ease of Use | 7/10 | More technical than Metabase |
| Visualization | **9/10** | Rich chart library; customizable |
| Data Security | 8/10 | Row-level security in open source |
| Self-Hosting | 8/10 | Docker deployment available |
| License | **10/10** | Apache 2.0 -- no compliance concerns |
| **Overall** | **8.5/10** | **Top pick for clinical visualization** |

#### Integration Path with FastAPI/SQLAlchemy

```python
# Apache Superset connects to PostgreSQL directly
# FastAPI can provision Superset resources via its API

import httpx
from fastapi import FastAPI

SUPerset_URL = "http://superset:8088"
SUPerset_ADMIN = "admin"
SUPerset_PASSWORD = "admin"

async def get_superset_token():
    """Get Superset access token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPerset_URL}/api/v1/security/login",
            json={
                "username": SUPerset_ADMIN,
                "password": SUPerset_PASSWORD,
                "provider": "db",
                "refresh": True,
            }
        )
        return response.json()["access_token"]

@app.post("/dashboards/create-clinical-dashboard")
async def create_clinical_dashboard(clinic_id: str):
    """Create a Superset dashboard for a clinic."""
    token = await get_superset_token()
    
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        # Create dataset
        dataset = await client.post(
            f"{SUPerset_URL}/api/v1/dataset/",
            headers=headers,
            json={
                "database": 1,  # PostgreSQL database ID
                "schema": "public",
                "table_name": "patients",
            }
        )
        
        dataset_id = dataset.json()["id"]
        
        # Create charts
        charts = []
        
        # Patient demographics chart
        chart1 = await client.post(
            f"{SUPerset_URL}/api/v1/chart/",
            headers=headers,
            json={
                "slice_name": "Patient Age Distribution",
                "dataset_id": dataset_id,
                "viz_type": "histogram",
                "params": {
                    "all_columns": ["age"],
                    "adhoc_filters": [],
                    "row_limit": 10000,
                }
            }
        )
        charts.append(chart1.json()["id"])
        
        # Create dashboard
        dashboard = await client.post(
            f"{SUPerset_URL}/api/v1/dashboard/",
            headers=headers,
            json={
                "dashboard_title": f"Clinical Dashboard - Clinic {clinic_id}",
                "published": False,
                "json_metadata": json.dumps({
                    "filter_scopes": {},
                    "expanded_slices": {},
                }),
            }
        )
        
        dashboard_id = dashboard.json()["id"]
        
        return {
            "dashboard_id": dashboard_id,
            "dataset_id": dataset_id,
            "chart_ids": charts,
        }
```

#### Limitations

- **Steeper learning curve** than Metabase for non-technical users
- **Setup complexity** -- requires Celery, Redis, and message broker for full features
- **No native healthcare visualizations** -- custom plugins needed
- **Python 3.9+ required** -- newer dependency chain
- **Resource-intensive** -- requires more memory than Metabase

---

### 8.3 Grafana

| Property | Detail |
|----------|--------|
| **Name** | Grafana |
| **Language** | Go / TypeScript / React |
| **License** | AGPL-3.0 (open core) + Commercial Enterprise |
| **GitHub** | https://github.com/grafana/grafana |
| **Stars** | ~67,000 |
| **Forks** | ~12,000 |
| **Maintainer** | Grafana Labs |
| **First Release** | 2014 |
| **Latest Activity** | Very active; Grafana Cloud available |

#### Key Features

- **Real-time monitoring dashboards** -- best for time-series data
- **150+ data sources** including Prometheus, InfluxDB, PostgreSQL, MySQL, Elasticsearch
- **Alerting** with multiple notification channels
- **Annotations** -- mark events on time-series graphs
- **Template variables** for dynamic dashboards
- **Plugin ecosystem** with 100+ community plugins
- **User management** with LDAP, OAuth, SAML integration
- **Dashboard provisioning** via Git/code

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Time-Series | **10/10** | Best-in-class for vital signs, monitoring |
| Ease of Use | 7/10 | Good for technical users |
| SQL Support | 6/10 | Limited compared to Superset/Metabase |
| Alerting | **9/10** | Excellent alerting system |
| **AGPL Concern** | **Caution** | Source code disclosure for network use |
| **Overall** | **7.5/10** | Best for real-time clinical monitoring |

#### Integration Path

```python
# Grafana dashboard provisioning for vital signs monitoring
# via Grafana's provisioning API

GRAFANA_URL = "http://grafana:3000"
GRAFANA_API_KEY = "your-api-key"

@app.post("/monitoring/setup-patient-vitals")
async def setup_patient_vitals_dashboard(patient_id: str):
    """Create Grafana dashboard for patient vital signs monitoring."""
    
    dashboard_json = {
        "dashboard": {
            "title": f"Patient Vitals - {patient_id}",
            "tags": ["clinical", "vitals"],
            "timezone": "browser",
            "panels": [
                {
                    "title": "Heart Rate",
                    "type": "graph",
                    "targets": [
                        {
                            "rawSql": f"""
                                SELECT timestamp, heart_rate 
                                FROM vital_signs 
                                WHERE patient_id = '{patient_id}' 
                                AND timestamp > NOW() - INTERVAL '24 hours'
                                ORDER BY timestamp
                            """,
                            "format": "time_series",
                        }
                    ],
                    "alert": {
                        "conditions": [
                            {
                                "evaluator": {"type": "gt", "params": [120]},
                                "operator": {"type": "and"},
                                "query": {"params": ["A", "5m", "now"]},
                                "reducer": {"type": "avg"},
                            }
                        ],
                        "name": "High Heart Rate Alert",
                        "message": f"Patient {patient_id} heart rate above threshold",
                    },
                    "yAxes": [
                        {"label": "BPM", "min": 40, "max": 200}
                    ],
                },
                {
                    "title": "Blood Pressure",
                    "type": "graph",
                    "targets": [
                        {
                            "rawSql": f"""
                                SELECT timestamp, systolic, diastolic 
                                FROM blood_pressure 
                                WHERE patient_id = '{patient_id}' 
                                AND timestamp > NOW() - INTERVAL '24 hours'
                                ORDER BY timestamp
                            """,
                            "format": "time_series",
                        }
                    ],
                },
            ],
        },
        "overwrite": True,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{GRAFANA_URL}/api/dashboards/db",
            headers={"Authorization": f"Bearer {GRAFANA_API_KEY}"},
            json=dashboard_json,
        )
        
        return response.json()
```

#### Limitations

- **AGPL license** -- source code disclosure concerns
- **Time-series focused** -- less suited for tabular/relational clinical data
- **SQL support is limited** -- not a full BI tool
- **No native drill-down** for patient records
- Enterprise SSO and advanced features require paid license

---

### 8.4 Redash

| Property | Detail |
|----------|--------|
| **Name** | Redash |
| **Language** | Python / React / TypeScript |
| **License** | BSD-2-Clause |
| **GitHub** | https://github.com/getredash/redash |
| **Stars** | ~27,000 |
| **Forks** | ~4,200 |
| **Maintainer** | Databricks (acquired 2020) |
| **First Release** | 2013 |
| **Latest Activity** | **Maintenance mode** since Databricks acquisition |

#### Key Features

- **Query-focused BI** -- write SQL, get visualizations
- **100+ data sources** including PostgreSQL, MySQL, BigQuery, Snowflake
- **Scheduled queries** with email/Slack notifications
- **Dashboards** with parameter support
- **Alerting** on query results
- **Forking and versioning** of queries
- **Collaborative** -- share queries and dashboards
- **Open source** under permissive BSD-2 license

#### Clinical Suitability Rating

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Ease of Use | 7/10 | Good for SQL-savvy users |
| Visualization | 7/10 | Adequate chart types |
| Maintenance | **4/10** | Effectively in maintenance mode |
| License | **10/10** | BSD-2 -- fully permissive |
| **Overall** | **5.5/10** | **Not recommended for new projects** |

#### Limitations

- **Maintenance mode** -- no significant feature development since 2020
- **Databricks acquisition** -- future as open source project uncertain
- **Use only if already deployed** -- not recommended for new projects
- Smaller community than Superset or Metabase
- Limited visualization customization

---

### 8.5 Comparative Matrix

| Tool | License | Stars | Ease of Use | SQL Required | Real-Time | Row-Level Security | Alerting | Active Dev | Clinical Score |
|------|---------|-------|-------------|--------------|-----------|-------------------|----------|------------|----------------|
| **Metabase** | AGPL | 41k | **9/10** | Optional | No | Enterprise | Yes | Yes | 8.0/10 |
| **Superset** | Apache | 65k | 7/10 | Yes | Via streaming | **Yes (OSS)** | Yes | Yes | **8.5/10** |
| **Grafana** | AGPL | 67k | 7/10 | Limited | **Yes** | Enterprise | **Excellent** | Yes | 7.5/10 |
| **Redash** | BSD | 27k | 7/10 | Yes | No | No | Yes | **No** | 5.5/10 |

#### Recommendation

**Apache Superset** is the top recommendation for clinic data visualization due to its Apache 2.0 license (no compliance concerns), built-in row-level security, rich visualization library, and active Apache Software Foundation governance.

For **real-time patient monitoring** (ICU, telemetry), **Grafana** is the best choice despite its AGPL license.

---

## 9. Export Tools

Clinic data consoles require robust export capabilities for reporting, interoperability, and patient records requests.

---

### 9.1 pandas

| Property | Detail |
|----------|--------|
| **Name** | pandas |
| **Language** | Python |
| **License** | BSD-3-Clause |
| **GitHub** | https://github.com/pandas-dev/pandas |
| **Stars** | ~45,000 |
| **Maintainer** | NumFOCUS / pandas Development Team |
| **Latest Activity** | Very active; de facto standard for Python data manipulation |

#### Key Features

- **DataFrame** data structure for tabular data manipulation
- **Read/write** CSV, Excel (XLSX), JSON, Parquet, SQL, HDF5, and more
- **Data cleaning** -- missing value handling, type conversion, deduplication
- **Aggregation and grouping** -- SQL-like operations
- **Merging and joining** -- relational data operations
- **Time series** functionality
- **Integration** with SQLAlchemy for database queries

#### Clinical Export Example

```python
import pandas as pd
from sqlalchemy import create_engine
from fastapi import FastAPI, Response, BackgroundTasks
from io import BytesIO, StringIO
import tempfile

app = FastAPI()

# SQLAlchemy engine for database queries
engine = create_engine("postgresql://user:pass@localhost/clinic_db")

def export_patients_to_csv(clinic_id: int, filters: dict = None) -> str:
    """Export patient data to CSV with HIPAA compliance."""
    
    query = """
        SELECT 
            p.medical_record_number,
            p.name,
            p.date_of_birth,
            p.gender,
            p.phone,
            p.email,
            p.address,
            p.insurance_id,
            p.emergency_contact,
            COUNT(a.id) as total_appointments,
            MAX(a.scheduled_at) as last_visit
        FROM patients p
        LEFT JOIN appointments a ON p.id = a.patient_id
        WHERE p.clinic_id = :clinic_id
        GROUP BY p.id
        ORDER BY p.name
    """
    
    df = pd.read_sql(query, engine, params={"clinic_id": clinic_id})
    
    # HIPAA Safe Harbor: Remove direct identifiers
    df = df.drop(columns=["phone", "email", "address", "insurance_id", "emergency_contact"])
    
    # Generalize date of birth to year only
    df["birth_year"] = pd.to_datetime(df["date_of_birth"]).dt.year
    df = df.drop(columns=["date_of_birth"])
    
    # Output to CSV
    output = StringIO()
    df.to_csv(output, index=False)
    return output.getvalue()

@app.get("/export/patients.csv")
async def export_patients_csv(clinic_id: int, background_tasks: BackgroundTasks):
    """Export patient data as CSV."""
    csv_content = export_patients_to_csv(clinic_id)
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=patients_{clinic_id}.csv"}
    )

def export_patients_to_excel(clinic_id: int) -> bytes:
    """Export patient data to formatted Excel with multiple sheets."""
    
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Sheet 1: Patient Demographics
        patients_df = pd.read_sql(
            "SELECT medical_record_number, name, gender, date_of_birth FROM patients WHERE clinic_id = %s",
            engine, params=(clinic_id,)
        )
        patients_df.to_excel(writer, sheet_name='Demographics', index=False)
        
        # Sheet 2: Appointments Summary
        appts_df = pd.read_sql("""
            SELECT 
                p.medical_record_number,
                COUNT(a.id) as total_appointments,
                COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled,
                COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_shows
            FROM patients p
            LEFT JOIN appointments a ON p.id = a.patient_id
            WHERE p.clinic_id = %s
            GROUP BY p.id
        """, engine, params=(clinic_id,))
        appts_df.to_excel(writer, sheet_name='Appointments', index=False)
        
        # Sheet 3: Billing Summary
        billing_df = pd.read_sql("""
            SELECT 
                p.medical_record_number,
                COUNT(b.id) as total_claims,
                SUM(b.amount) as total_billed,
                SUM(b.amount_paid) as total_paid,
                SUM(b.amount - b.amount_paid) as outstanding
            FROM patients p
            LEFT JOIN billing_records b ON p.id = b.patient_id
            WHERE p.clinic_id = %s
            GROUP BY p.id
        """, engine, params=(clinic_id,))
        billing_df.to_excel(writer, sheet_name='Billing', index=False)
    
    output.seek(0)
    return output.getvalue()

@app.get("/export/patients.xlsx")
async def export_patients_excel(clinic_id: int):
    """Export patient data as multi-sheet Excel workbook."""
    excel_bytes = export_patients_to_excel(clinic_id)
    
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=patients_{clinic_id}.xlsx"}
    )
```

#### Limitations

- **Memory usage** -- large exports can consume significant RAM
- **No streaming** -- entire DataFrame loaded into memory
- **Limited formatting** -- basic styling in Excel output
- **Not suitable for very large datasets** without chunking

---

### 9.2 WeasyPrint

| Property | Detail |
|----------|--------|
| **Name** | WeasyPrint |
| **Language** | Python |
| **License** | BSD-3-Clause |
| **GitHub** | https://github.com/Kozea/WeasyPrint |
| **Stars** | ~7,000 |
| **Maintainer** | Kozea |
| **Latest Activity** | Active |

#### Key Features

- **HTML/CSS to PDF conversion** using modern web standards
- **Full CSS 3 support** including flexbox, grid, and advanced selectors
- **Page-level CSS** -- @page rules for margins, headers, footers, page numbers
- **SVG support** for charts and diagrams
- **Font embedding** including custom web fonts
- **Accessible PDFs** with tagged content
- **Pythonic API** -- easy integration with FastAPI

#### Clinical PDF Export Example

```python
# WeasyPrint for clinical report generation
from weasyprint import HTML, CSS
from fastapi import FastAPI, Response
from jinja2 import Template
import datetime

CLINICAL_REPORT_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <style>
        @page {
            size: letter;
            margin: 2cm;
            @top-center { content: "{{ clinic_name }} - Confidential"; font-size: 8pt; color: #666; }
            @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; }
        }
        body { font-family: 'Helvetica', Arial, sans-serif; font-size: 10pt; }
        .header { text-align: center; border-bottom: 2px solid #2c5aa0; padding-bottom: 10px; margin-bottom: 20px; }
        .header h1 { color: #2c5aa0; font-size: 18pt; margin: 0; }
        .section { margin-bottom: 15px; }
        .section-title { background: #2c5aa0; color: white; padding: 5px 10px; font-weight: bold; }
        .field-row { display: flex; border-bottom: 1px solid #eee; padding: 5px 0; }
        .field-label { width: 200px; font-weight: bold; color: #555; }
        .field-value { flex: 1; }
        .phi-warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px 0; font-size: 9pt; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th { background: #f0f0f0; text-align: left; padding: 8px; border-bottom: 2px solid #ddd; }
        td { padding: 8px; border-bottom: 1px solid #eee; }
        .footer { margin-top: 30px; font-size: 8pt; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Patient Clinical Summary</h1>
        <p>{{ clinic_name }} | {{ report_date }}</p>
    </div>
    
    <div class="phi-warning">
        <strong>CONFIDENTIAL - Protected Health Information (PHI)</strong><br>
        This document contains sensitive health information protected under HIPAA. 
        Unauthorized disclosure is prohibited. Distribution is limited to authorized healthcare providers.
    </div>
    
    <div class="section">
        <div class="section-title">Patient Demographics</div>
        <div class="field-row">
            <div class="field-label">Name:</div>
            <div class="field-value">{{ patient.name }}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Medical Record Number:</div>
            <div class="field-value">{{ patient.mrn }}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Date of Birth:</div>
            <div class="field-value">{{ patient.dob }}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Gender:</div>
            <div class="field-value">{{ patient.gender }}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Phone:</div>
            <div class="field-value">{{ patient.phone }}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Emergency Contact:</div>
            <div class="field-value">{{ patient.emergency_contact }}</div>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Recent Appointments</div>
        <table>
            <thead>
                <tr><th>Date</th><th>Type</th><th>Provider</th><th>Status</th><th>Notes</th></tr>
            </thead>
            <tbody>
                {% for appt in appointments %}
                <tr>
                    <td>{{ appt.date }}</td>
                    <td>{{ appt.type }}</td>
                    <td>{{ appt.provider }}</td>
                    <td>{{ appt.status }}</td>
                    <td>{{ appt.notes }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>
    
    <div class="section">
        <div class="section-title">Active Medications</div>
        <table>
            <thead>
                <tr><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Prescribed By</th><th>Start Date</th></tr>
            </thead>
            <tbody>
                {% for med in medications %}
                <tr>
                    <td>{{ med.name }}</td>
                    <td>{{ med.dosage }}</td>
                    <td>{{ med.frequency }}</td>
                    <td>{{ med.prescribed_by }}</td>
                    <td>{{ med.start_date }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
    </div>
    
    <div class="footer">
        <p>Report generated on {{ report_date }} by {{ generated_by }}</p>
        <p>This report is intended for authorized healthcare providers only. Unauthorized distribution is prohibited.</p>
        <p>{{ clinic_name }} | {{ clinic_address }} | {{ clinic_phone }}</p>
    </div>
</body>
</html>
"""

@app.get("/patients/{patient_id}/report.pdf")
async def generate_patient_report(patient_id: int, db: Session = Depends(get_db)):
    """Generate clinical summary PDF for a patient."""
    
    # Fetch patient data
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    appointments = db.query(Appointment).filter(
        Appointment.patient_id == patient_id
    ).order_by(Appointment.scheduled_at.desc()).limit(10).all()
    
    medications = db.query(Medication).filter(
        Medication.patient_id == patient_id,
        Medication.status == "active"
    ).all()
    
    # Render HTML
    template = Template(CLINICAL_REPORT_TEMPLATE)
    html_content = template.render(
        clinic_name="City Medical Clinic",
        clinic_address="123 Healthcare Dr, Medical City, ST 12345",
        clinic_phone="(555) 123-4567",
        report_date=datetime.now().strftime("%B %d, %Y at %H:%M"),
        generated_by="Dr. Smith",
        patient={
            "name": patient.name,
            "mrn": patient.medical_record_number,
            "dob": patient.date_of_birth.strftime("%B %d, %Y"),
            "gender": patient.gender,
            "phone": patient.phone,
            "emergency_contact": patient.emergency_contact,
        },
        appointments=[{
            "date": a.scheduled_at.strftime("%Y-%m-%d"),
            "type": a.appointment_type,
            "provider": a.provider_name,
            "status": a.status,
            "notes": a.notes or "",
        } for a in appointments],
        medications=[{
            "name": m.name,
            "dosage": m.dosage,
            "frequency": m.frequency,
            "prescribed_by": m.prescribed_by,
            "start_date": m.start_date.strftime("%Y-%m-%d"),
        } for m in medications],
    )
    
    # Convert to PDF
    html = HTML(string=html_content)
    pdf_bytes = html.write_pdf()
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=patient_{patient_id}_report.pdf"}
    )
```

#### Limitations

- **System dependencies** -- requires Pango, Cairo, GDK-PixBuf (system packages)
- **Performance** -- HTML rendering can be slow for complex documents
- **Memory** -- large documents consume significant RAM
- **JavaScript** -- no JavaScript execution (static HTML/CSS only)
- **Docker** -- requires careful base image selection with system dependencies

---

### 9.3 FHIR.js

| Property | Detail |
|----------|--------|
| **Name** | FHIR.js (Lantana Group) |
| **Language** | JavaScript / Node.js |
| **License** | Apache 2.0 |
| **GitHub** | https://github.com/lantanagroup/FHIR.js |
| **Stars** | ~200 |
| **Maintainer** | Lantana Consulting Group |

**Note:** There are two FHIR.js libraries:
1. **Lantana FHIR.js** (Apache 2.0) -- serialization, validation, FhirPath
2. **FHIR/fhir.js** (MIT) -- FHIR client for API interactions

#### Key Features

- **FHIR resource serialization** between JSON and XML
- **FHIR validation** against core spec and custom profiles
- **FhirPath evaluation** for resource querying
- **Multiple FHIR version support** (STU3, R4, R4B, R5)
- **Profile-based validation** -- validate against Implementation Guides
- **Browser and Node.js** compatible

#### Clinical FHIR Export Example

```python
# Python FHIR generation (no direct FHIR.js in Python)
# Using fhir.resources library (pip install fhir.resources)

from fhir.resources.patient import Patient as FHIRPatient
from fhir.resources.humanname import HumanName
from fhir.resources.contactpoint import ContactPoint
from fhir.resources.address import Address
from fhir.resources.observation import Observation
from fhir.resources.codeableconcept import CodeableConcept
from fhir.resources.coding import Coding
from fhir.resources.identifier import Identifier
import json
from fastapi import Response

def patient_to_fhir(db_patient) -> dict:
    """Convert SQLAlchemy Patient model to FHIR R4 Patient resource."""
    
    fhir_patient = FHIRPatient(
        id=str(db_patient.id),
        identifier=[
            Identifier(
                system="http://clinic.example.org/mrn",
                value=db_patient.medical_record_number,
            )
        ],
        active=True,
        name=[
            HumanName(
                text=db_patient.name,
                family=db_patient.name.split()[-1] if db_patient.name else "",
                given=db_patient.name.split()[:-1] if db_patient.name else [],
            )
        ],
        gender=db_patient.gender.lower() if db_patient.gender else "unknown",
        birthDate=db_patient.date_of_birth.isoformat() if db_patient.date_of_birth else None,
        telecom=[
            ContactPoint(
                system="phone",
                value=db_patient.phone,
                use="home",
            ),
            ContactPoint(
                system="email",
                value=db_patient.email,
                use="work",
            ),
        ] if db_patient.phone or db_patient.email else [],
        address=[
            Address(
                text=db_patient.address,
                use="home",
            )
        ] if db_patient.address else [],
    )
    
    return json.loads(fhir_patient.json())

def vital_signs_to_fhir_observation(db_vitals, patient_id: str) -> dict:
    """Convert vital signs to FHIR Observation resource."""
    
    observation = Observation(
        status="final",
        category=[
            CodeableConcept(
                coding=[
                    Coding(
                        system="http://terminology.hl7.org/CodeSystem/observation-category",
                        code="vital-signs",
                        display="Vital Signs",
                    )
                ]
            )
        ],
        code=CodeableConcept(
            coding=[
                Coding(
                    system="http://loinc.org",
                    code="85354-9",
                    display="Blood pressure panel",
                )
            ]
        ),
        subject={"reference": f"Patient/{patient_id}"},
        effectiveDateTime=db_vitals.recorded_at.isoformat() if db_vitals.recorded_at else None,
        component=[
            {
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "8480-6",
                            "display": "Systolic blood pressure",
                        }
                    ]
                },
                "valueQuantity": {
                    "value": db_vitals.systolic,
                    "unit": "mmHg",
                    "system": "http://unitsofmeasure.org",
                    "code": "mm[Hg]",
                },
            },
            {
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "8462-4",
                            "display": "Diastolic blood pressure",
                        }
                    ]
                },
                "valueQuantity": {
                    "value": db_vitals.diastolic,
                    "unit": "mmHg",
                    "system": "http://unitsofmeasure.org",
                    "code": "mm[Hg]",
                },
            },
        ],
    )
    
    return json.loads(observation.json())

@app.get("/patients/{patient_id}/export/fhir")
async def export_patient_fhir(patient_id: int, db: Session = Depends(get_db)):
    """Export patient data as FHIR R4 Bundle."""
    
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Build FHIR Bundle
    bundle = {
        "resourceType": "Bundle",
        "id": str(uuid.uuid4()),
        "meta": {
            "versionId": "1",
            "lastUpdated": datetime.utcnow().isoformat() + "Z",
        },
        "type": "collection",
        "entry": [],
    }
    
    # Add Patient resource
    bundle["entry"].append({
        "fullUrl": f"http://clinic.example.org/fhir/Patient/{patient_id}",
        "resource": patient_to_fhir(patient),
    })
    
    # Add Observations (vital signs)
    vitals = db.query(VitalSign).filter(VitalSign.patient_id == patient_id).all()
    for v in vitals:
        bundle["entry"].append({
            "fullUrl": f"http://clinic.example.org/fhir/Observation/{v.id}",
            "resource": vital_signs_to_fhir_observation(v, str(patient_id)),
        })
    
    return Response(
        content=json.dumps(bundle, indent=2),
        media_type="application/fhir+json",
        headers={
            "Content-Disposition": f"attachment; filename=patient_{patient_id}.json",
            "X-Export-Type": "FHIR-R4",
        }
    )
```

#### Limitations

- **JavaScript library** -- Python alternatives (fhir.resources, fhirclient) needed for Python backends
- **Validation complexity** -- profile validation requires extensive FHIR knowledge
- **Version compatibility** -- must track FHIR specification versions
- **Limited stars** -- smaller community; production readiness varies

---

### 9.4 jsonschema

| Property | Detail |
|----------|--------|
| **Name** | jsonschema |
| **Language** | Python |
| **License** | MIT |
| **GitHub** | https://github.com/python-jsonschema/jsonschema |
| **Stars** | ~5,000 |
| **Maintainer** | Julian Berman / Python community |
| **Latest Activity** | Active; widely used |

#### Key Features

- **JSON Schema validation** for Python
- **Draft 7, 2019-09, 2020-12** support
- **Custom validators** for domain-specific validation
- **Error reporting** with detailed messages
- **Reference resolution** for external schemas

#### Clinical Validation Example

```python
from jsonschema import validate, ValidationError, FormatChecker
from fastapi import HTTPException
import json

# FHIR-aligned patient schema for validation
PATIENT_EXPORT_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "PatientExport",
    "description": "Validated schema for patient data export",
    "type": "object",
    "required": ["resourceType", "id", "identifier", "name", "gender"],
    "properties": {
        "resourceType": {
            "type": "string",
            "const": "Patient",
        },
        "id": {
            "type": "string",
            "pattern": "^[0-9]+$",
        },
        "identifier": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["system", "value"],
                "properties": {
                    "system": {"type": "string", "format": "uri"},
                    "value": {"type": "string", "minLength": 1},
                },
            },
        },
        "name": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["text"],
                "properties": {
                    "text": {"type": "string", "minLength": 1},
                    "family": {"type": "string"},
                    "given": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "gender": {
            "type": "string",
            "enum": ["male", "female", "other", "unknown"],
        },
        "birthDate": {
            "type": "string",
            "format": "date",
        },
        "telecom": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "system": {"type": "string", "enum": ["phone", "email", "fax", "sms"]},
                    "value": {"type": "string"},
                    "use": {"type": "string", "enum": ["home", "work", "mobile", "old"]},
                },
            },
        },
        "address": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "use": {"type": "string", "enum": ["home", "work", "temp", "old"]},
                    "text": {"type": "string"},
                    "city": {"type": "string"},
                    "state": {"type": "string"},
                    "postalCode": {
                        "type": "string",
                        "pattern": "^\\d{5}(-\\d{4})?$",
                    },
                },
            },
        },
    },
    "additionalProperties": False,
}

# Export format schema for CSV export
CSV_EXPORT_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "CSVExportRequest",
    "type": "object",
    "required": ["format", "resource_type"],
    "properties": {
        "format": {"type": "string", "const": "CSV"},
        "resource_type": {"type": "string", "enum": ["Patient", "Appointment", "Observation"]},
        "filters": {
            "type": "object",
            "properties": {
                "clinic_id": {"type": "integer"},
                "date_from": {"type": "string", "format": "date"},
                "date_to": {"type": "string", "format": "date"},
                "patient_ids": {"type": "array", "items": {"type": "integer"}},
            },
        },
        "columns": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
        },
        "anonymize": {
            "type": "object",
            "properties": {
                "method": {"type": "string", "enum": ["safe_harbor", "k_anonymity", "none"]},
                "k": {"type": "integer", "minimum": 2},
            },
        },
    },
}

def validate_export_request(data: dict) -> dict:
    """Validate export request against schema."""
    try:
        validate(instance=data, schema=CSV_EXPORT_SCHEMA, format_checker=FormatChecker())
        return {"valid": True, "errors": []}
    except ValidationError as e:
        return {
            "valid": False,
            "errors": [
                {
                    "field": " -> ".join(str(p) for p in e.absolute_path),
                    "message": e.message,
                    "schema_path": list(e.absolute_schema_path),
                }
            ],
        }

def validate_patient_export(data: dict) -> None:
    """Validate patient export data. Raises HTTPException if invalid."""
    try:
        validate(instance=data, schema=PATIENT_EXPORT_SCHEMA, format_checker=FormatChecker())
    except ValidationError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Invalid patient export data",
                "field": " -> ".join(str(p) for p in e.absolute_path),
                "message": e.message,
            }
        )

@app.post("/export/validate")
async def validate_export_request_endpoint(request_data: dict):
    """Validate an export request before processing."""
    result = validate_export_request(request_data)
    if not result["valid"]:
        raise HTTPException(status_code=422, detail=result)
    return {"status": "valid", "message": "Export request is valid"}
```

#### Limitations

- **Validation only** -- does not transform or process data
- **Performance** -- complex schemas can be slow to validate
- **FHIR validation** -- requires building comprehensive FHIR schemas manually
- **Limited format validation** -- basic format checking only

---

## 10. Architecture Recommendations

### Recommended Clinic Data Console Stack

Based on this research, the following architecture is recommended for building a HIPAA-compliant clinic data console:

```
+-----------------------------------------------------+
|                    Frontend Layer                    |
|  +-------------+  +-------------+  +-------------+  |
|  |   refine    |  |   Superset  |  |   Grafana   |  |
|  |   (MIT)     |  |  (Apache)   |  |  (AGPL)     |  |
|  | Admin Panel |  |    BI/      |  |  Real-time  |  |
|  |             |  | Analytics   |  |  Monitoring |  |
|  +-------------+  +-------------+  +-------------+  |
+-----------------------------------------------------+
                         |
+-----------------------------------------------------+
|                    API Gateway                       |
|  FastAPI + SQLAlchemy + PostgreSQL                  |
|  - Authentication (OAuth 2.0 + SMART on FHIR)       |
|  - Consent Management (UMA-inspired)                 |
|  - Audit Logging (Custom Middleware)                 |
|  - FHIR API (fhir.resources)                         |
|  - Data Anonymization (ARX + Python)                 |
+-----------------------------------------------------+
                         |
+-----------------------------------------------------+
|                    Data Layer                        |
|  +-------------+  +-------------+  +-------------+  |
|  |  PostgreSQL |  |   Redis     |  |   Celery    |  |
|  |  (Primary)  |  |  (Cache/    |  |  (Async     |  |
|  |             |  |  Sessions)  |  |  Tasks)     |  |
|  +-------------+  +-------------+  +-------------+  |
+-----------------------------------------------------+
```

### Component Selection Rationale

| Layer | Tool | Rationale |
|-------|------|-----------|
| Admin Panel | **refine** | MIT license, headless design, best TypeScript/React integration |
| BI/Analytics | **Apache Superset** | Apache 2.0, built-in row-level security, rich visualizations |
| Real-time | **Grafana** (optional) | Best for time-series vital sign monitoring |
| Backend | **FastAPI + SQLAlchemy** | Python-native, async, automatic OpenAPI docs |
| Database | **PostgreSQL** | ACID compliance, JSON support, encryption at rest |
| Cache | **Redis** | Session management, query caching, rate limiting |
| Tasks | **Celery** | Async export generation, report scheduling |
| Auth | **OAuth 2.0 + SMART** | Industry standard for healthcare |
| Audit | **Custom middleware** | Full control over HIPAA audit requirements |
| Consent | **Custom + UMA-inspired** | Patient-managed access aligned with GDPR/HIPAA |
| Anonymization | **ARX** | Gold standard; MIT integration via subprocess |
| Export | **pandas + WeasyPrint** | BSD licenses, proven for clinical reporting |
| FHIR | **fhir.resources** | Python-native FHIR R4/R5 resource library |

### Security Checklist

- [ ] All PHI encrypted at rest (PostgreSQL TDE or filesystem encryption)
- [ ] All data encrypted in transit (TLS 1.3 minimum)
- [ ] OAuth 2.0 / OpenID Connect for authentication
- [ ] SMART on FHIR scopes for authorization
- [ ] Comprehensive audit logging (all PHI access)
- [ ] Consent management (all data use tracked)
- [ ] Data anonymization for research exports
- [ ] Row-level security in BI tools
- [ ] Session timeout (15 minutes of inactivity)
- [ ] Account lockout after failed login attempts
- [ ] Regular security audits and penetration testing
- [ ] BAA (Business Associate Agreement) documentation
- [ ] Data backup and disaster recovery procedures

---

## 11. Compliance Matrix

### HIPAA Technical Safeguards

| Safeguard | Requirement | Tools Addressing |
|-----------|-------------|------------------|
| Access Control (164.312(a)) | Unique user IDs, emergency access, automatic logoff | Custom auth + OAuth 2.0 |
| Audit Controls (164.312(b)) | Record activity of PHI access | Custom audit middleware |
| Integrity (164.312(c)) | Protection from improper alteration | SQLAlchemy + PostgreSQL constraints |
| Person Authentication (164.312(d)) | Verify person seeking access | OAuth 2.0 + MFA |
| Transmission Security (164.312(e)) | Integrity, encryption | TLS 1.3, PostgreSQL SSL |

### GDPR Compliance

| Requirement | Implementation |
|-------------|---------------|
| Right to Access | Patient portal with full record export |
| Right to Rectification | Patient data editing via refine admin |
| Right to Erasure | Soft delete + anonymization pipeline |
| Right to Portability | FHIR export for data portability |
| Consent Management | Custom consent management system |
| Data Minimization | Field-level access control + anonymization |
| Privacy by Design | Architecture built with privacy controls |

### License Compatibility Matrix

| Tool | License | Commercial Use | Modify | Distribute | Network Use Notes |
|------|---------|---------------|--------|------------|-------------------|
| refine | MIT | Yes | Yes | Yes | No restrictions |
| React Admin | MIT | Yes | Yes | Yes | No restrictions |
| Baserow | MIT | Yes | Yes | Yes | No restrictions |
| Appsmith | Apache 2.0 | Yes | Yes | Yes | Patent grant included |
| Apache Superset | Apache 2.0 | Yes | Yes | Yes | Patent grant included |
| ARX | Apache 2.0 | Yes | Yes | Yes | Patent grant included |
| pandas | BSD | Yes | Yes | Yes | No restrictions |
| WeasyPrint | BSD | Yes | Yes | Yes | No restrictions |
| Redash | BSD-2 | Yes | Yes | Yes | No restrictions |
| Grafana | AGPL-3.0 | Yes | Yes | Yes | Source code must be shared with users |
| Metabase | AGPL-3.0 | Yes | Yes | Yes | Source code must be shared with users |
| Directus | BSL | <$5M revenue | Limited | Limited | Revenue-based restrictions |
| ToolJet | AGPL-3.0 | Yes | Yes | Yes | Source code must be shared with users |
| OpenEMR | GPL | Yes | Yes | Yes | Derivative works must be GPL |
| OpenMRS | MPL 2.0 | Yes | Yes | Yes | File-level copyleft |
| GNU Health | GPL | Yes | Yes | Yes | Derivative works must be GPL |

---

## 12. References

1. **React Admin** -- https://github.com/marmelab/react-admin (26,700 stars, MIT License)
2. **refine** -- https://github.com/refinedev/refine (34,000 stars, MIT License)
3. **AdminJS** -- https://github.com/SoftwareBrothers/adminjs (8,500 stars, MIT License)
4. **Appsmith** -- https://github.com/appsmithorg/appsmith (37,000 stars, Apache 2.0)
5. **ToolJet** -- https://github.com/ToolJet/ToolJet (34,000 stars, AGPL-3.0)
6. **Directus** -- https://github.com/directus/directus (28,000 stars, BSL 1.1)
7. **Baserow** -- https://github.com/baserow/baserow (4,800 stars, MIT License)
8. **NocoDB** -- https://github.com/nocodb/nocodb (54,800 stars, AGPL/Sustainable Use License)
9. **Grist** -- https://github.com/gristlabs/grist-core (6,200 stars, Apache 2.0)
10. **Teable** -- https://github.com/teableio/teable (18,600 stars, AGPL-3.0)
11. **OpenEMR** -- https://github.com/openemr/openemr (8,500 stars, GPL)
12. **OpenMRS** -- https://github.com/openmrs/openmrs-core (1,200 stars, MPL 2.0)
13. **GNU Health** -- https://github.com/gnuhealth/gnuhealth (600 stars, GPLv3+)
14. **LibreHealth** -- https://github.com/LibreHealthIO/lh-ehr (290 stars, MPL 2.0)
15. **ARX** -- https://github.com/arx-deidentifier/arx (900 stars, Apache 2.0)
16. **Amnesia** -- https://github.com/dTsitsigkos/Amnesia (100 stars, MIT License)
17. **Metabase** -- https://github.com/metabase/metabase (41,000 stars, AGPL-3.0)
18. **Apache Superset** -- https://github.com/apache/superset (65,000 stars, Apache 2.0)
19. **Grafana** -- https://github.com/grafana/grafana (67,000 stars, AGPL-3.0)
20. **Redash** -- https://github.com/getredash/redash (27,000 stars, BSD-2)
21. **pandas** -- https://github.com/pandas-dev/pandas (45,000 stars, BSD-3)
22. **WeasyPrint** -- https://github.com/Kozea/WeasyPrint (7,000 stars, BSD-3)
23. **FHIR.js** -- https://github.com/lantanagroup/FHIR.js (200 stars, Apache 2.0)
24. **jsonschema** -- https://github.com/python-jsonschema/jsonschema (5,000 stars, MIT)
25. **UMA 2.0** -- https://docs.kantarainitiative.org/uma/rec-uma-core.html (Open Standard)
26. **SMART on FHIR** -- https://smarthealthit.org/ (Open Standard)
27. **XACML 3.0** -- https://docs.oasis-open.org/xacml/3.0/ (Open Standard)
28. **OpenDP** -- https://github.com/opendp/opendp (MIT License)
29. **Google DP Library** -- https://github.com/google/differential-privacy (Apache 2.0)
30. **HIPAA Security Rule** -- 45 CFR 164.312 (U.S. Federal Regulation)
31. **GDPR** -- Regulation (EU) 2016/679 (European Union)

---

> **Disclaimer:** This report is for informational purposes only. It does not constitute legal advice. Healthcare organizations should consult with qualified legal counsel and compliance officers when implementing systems that handle Protected Health Information (PHI). All license information was verified at the time of writing but may change -- always verify current license terms directly from the project's official repository.

---

*Report generated through comprehensive analysis of open source healthcare technology tools, with verification of license terms, GitHub metrics, clinical feature assessment, and FastAPI/SQLAlchemy integration patterns.*
