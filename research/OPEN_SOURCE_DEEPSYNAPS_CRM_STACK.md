# DeepSynaps Protocol: Open-Source CRM Stack Research Report

**Version:** 1.0.0
**Date:** 2026-05-15
**Classification:** Technical Reference Architecture
**Maintainer:** DeepSynaps Protocol Studio

---

## Executive Summary

This report presents a comprehensive analysis of open-source tools suitable for building the **DeepSynaps CRM Platform** -- a modern, AI-ready customer relationship management system. The research covers eight critical categories: Admin Dashboard Frameworks, Analytics & BI, CRM Systems, Support/Ticketing, Monitoring & Observability, Audit Logging, Data Export, and Billing Integration.

Each tool is evaluated on:
- **GitHub stars** (community adoption)
- **License compatibility** (MIT/Apache preferred for commercial use)
- **FastAPI + SQLAlchemy integration path**
- **Production readiness**
- **Code example**
- **Known limitations**

**Key Recommendation:** Build the DeepSynaps CRM core on **FastAPI + SQLAlchemy** with **refine** (MIT) for the admin frontend, **Metabase** (AGPL) for BI analytics, **EspoCRM** (AGPL) as a reference CRM architecture, **Zammad** (AGPL) for support ticketing, **Prometheus + Grafana** for monitoring, **pgAudit** for audit logging, **pandas + WeasyPrint** for data export, and **Stripe Python SDK** for billing integration.

---

## Table of Contents

1. [Admin Dashboard Frameworks](#1-admin-dashboard-frameworks)
2. [Analytics & BI](#2-analytics--bi)
3. [CRM Systems (Open Source)](#3-crm-systems-open-source)
4. [Support/Ticketing](#4-supportticketing)
5. [Monitoring & Observability](#5-monitoring--observability)
6. [Audit Logging](#6-audit-logging)
7. [Data Export](#7-data-export)
8. [Billing Integration](#8-billing-integration)
9. [Integration Architecture](#9-integration-architecture)
10. [Comparison Matrices](#10-comparison-matrices)
11. [Security & Compliance Matrix](#11-security--compliance-matrix)
12. [Final Recommendations](#12-final-recommendations)

---

## 1. Admin Dashboard Frameworks

### 1.1 React Admin (MIT)

| Attribute | Detail |
|-----------|--------|
| **Name** | React Admin |
| **Language** | TypeScript/React |
| **License** | MIT |
| **GitHub URL** | https://github.com/marmelab/react-admin |
| **Stars** | ~25,000+ |
| **Website** | https://marmelab.com/react-admin |

**Key Features:**
- Frontend framework for building admin applications on top of REST/GraphQL APIs
- Built-in data-driven components: `<Datagrid>`, `<List>`, `<Edit>`, `<Create>`, `<Show>`
- Advanced filtering with `<Filter>` components
- CSV/Excel export out of the box
- Role-based access control (RBAC) with `<Authenticated>` and `<WithPermissions>`
- Real-time updates via `ra-realtime` package
- Authentication providers for OAuth, JWT, basic auth
- Theming with Material-UI (MUI v5)
- i18n support for 40+ languages
- Custom field types and input components
- Relationship handling (ReferenceField, ReferenceManyField)
- Dashboard composition with `<Dashboard>`
- Undo capabilities for destructive actions

**Integration Path with FastAPI + SQLAlchemy:**

React Admin expects a REST API following specific conventions. FastAPI can expose these endpoints using `fastapi-admin` patterns or custom routers.

```python
# FastAPI Backend: Universal CRUD Router for React Admin
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func, asc, desc
from typing import List, Optional, Any
from pydantic import BaseModel

# Pydantic schemas for request/response
class CustomerBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(CustomerBase):
    name: Optional[str] = None
    email: Optional[str] = None

class CustomerResponse(CustomerBase):
    id: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

# React Admin-compatible CRUD router
def create_crud_router(
    model: type,
    create_schema: type,
    update_schema: type,
    response_schema: type,
    db_session: callable,
    prefix: str
):
    router = APIRouter(prefix=f"/{prefix}", tags=[prefix])

    @router.get("", response_model=List[response_schema])
    async def list_items(
        request: Request,
        db: Session = Depends(db_session),
        _start: int = Query(0, alias="_start"),
        _end: int = Query(25, alias="_end"),
        _sort: str = Query("id", alias="_sort"),
        _order: str = Query("ASC", alias="_order"),
        q: Optional[str] = None,
        # Dynamic filters
        **filters
    ):
        query = select(model)
        
        # Apply search filter
        if q:
            searchable_fields = ["name", "email", "company"]
            conditions = []
            for field in searchable_fields:
                if hasattr(model, field):
                    conditions.append(getattr(model, field).ilike(f"%{q}%"))
            if conditions:
                from sqlalchemy import or_
                query = query.where(or_(*conditions))
        
        # Apply column filters (React Admin filter format)
        for key, value in filters.items():
            if not key.startswith("_") and hasattr(model, key):
                column = getattr(model, key)
                if isinstance(value, list):
                    query = query.where(column.in_(value))
                elif isinstance(value, dict):
                    # Range filters
                    if "gte" in value:
                        query = query.where(column >= value["gte"])
                    if "lte" in value:
                        query = query.where(column <= value["lte"])
                else:
                    query = query.where(column == value)
        
        # Get total count for Content-Range header
        total_query = select(func.count()).select_from(query.subquery())
        total = db.execute(total_query).scalar()
        
        # Apply sorting
        sort_column = getattr(model, _sort, model.id)
        order_func = desc if _order.upper() == "DESC" else asc
        query = query.order_by(order_func(sort_column))
        
        # Apply pagination
        query = query.offset(_start).limit(_end - _start)
        
        results = db.execute(query).scalars().all()
        
        return Response(
            content=json.dumps([response_schema.from_orm(r).dict() for r in results], default=str),
            media_type="application/json",
            headers={
                "X-Total-Count": str(total),
                "Content-Range": f"{prefix} {_start}-{_end}/{total}"
            }
        )

    @router.get("/{item_id}", response_model=response_schema)
    async def get_item(item_id: int, db: Session = Depends(db_session)):
        item = db.get(model, item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Not found")
        return item

    @router.post("", response_model=response_schema, status_code=201)
    async def create_item(item: create_schema, db: Session = Depends(db_session)):
        db_item = model(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    @router.put("/{item_id}", response_model=response_schema)
    async def update_item(item_id: int, item: update_schema, db: Session = Depends(db_session)):
        db_item = db.get(model, item_id)
        if not db_item:
            raise HTTPException(status_code=404, detail="Not found")
        update_data = item.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_item, field, value)
        db.commit()
        db.refresh(db_item)
        return db_item

    @router.delete("/{item_id}", response_model=response_schema)
    async def delete_item(item_id: int, db: Session = Depends(db_session)):
        db_item = db.get(model, item_id)
        if not db_item:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(db_item)
        db.commit()
        return db_item

    return router

# Usage in main FastAPI app
customer_router = create_crud_router(
    model=Customer,
    create_schema=CustomerCreate,
    update_schema=CustomerUpdate,
    response_schema=CustomerResponse,
    db_session=get_db,
    prefix="customers"
)
app.include_router(customer_router)
```

```typescript
// React Admin Frontend: App.tsx
import { Admin, Resource, ListGuesser, EditGuesser } from 'react-admin';
import { dataProvider } from './dataProvider';
import { authProvider } from './authProvider';

// Custom data provider for FastAPI backend
import { fetchUtils } from 'react-admin';

const httpClient = (url: string, options: any = {}) => {
    if (!options.headers) {
        options.headers = new Headers({ Accept: 'application/json' });
    }
    const token = localStorage.getItem('token');
    if (token) {
        options.headers.set('Authorization', `Bearer ${token}`);
    }
    return fetchUtils.fetchJson(url, options);
};

// FastAPI-compatible data provider
const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const dataProvider = {
    getList: (resource: string, params: any) => {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;
        const query = {
            _sort: field,
            _order: order,
            _start: (page - 1) * perPage,
            _end: page * perPage,
            ...params.filter
        };
        const url = `${apiUrl}/${resource}?${new URLSearchParams(query)}`;
        return httpClient(url).then(({ headers, json }) => ({
            data: json,
            total: parseInt(headers.get('x-total-count') || '0'),
        }));
    },
    getOne: (resource: string, params: any) =>
        httpClient(`${apiUrl}/${resource}/${params.id}`).then(({ json }) => ({
            data: json,
        })),
    create: (resource: string, params: any) =>
        httpClient(`${apiUrl}/${resource}`, {
            method: 'POST',
            body: JSON.stringify(params.data),
        }).then(({ json }) => ({ data: { ...params.data, id: json.id }, })),
    update: (resource: string, params: any) =>
        httpClient(`${apiUrl}/${resource}/${params.id}`, {
            method: 'PUT',
            body: JSON.stringify(params.data),
        }).then(({ json }) => ({ data: json, })),
    delete: (resource: string, params: any) =>
        httpClient(`${apiUrl}/${resource}/${params.id}`, {
            method: 'DELETE',
        }).then(({ json }) => ({ data: json, })),
};

export const App = () => (
    <Admin dataProvider={dataProvider} authProvider={authProvider}>
        <Resource
            name="customers"
            list={CustomerList}
            edit={CustomerEdit}
            create={CustomerCreate}
            show={CustomerShow}
        />
        <Resource name="contacts" list={ListGuesser} edit={EditGuesser} />
        <Resource name="deals" list={DealList} edit={DealEdit} create={DealCreate} />
        <Resource name="tasks" list={TaskList} edit={TaskEdit} />
    </Admin>
);

// Custom List component with filters
const CustomerList = (props: any) => (
    <List {...props} filters={<CustomerFilter />} perPage={25}>
        <Datagrid rowClick="edit">
            <TextField source="id" />
            <TextField source="name" />
            <EmailField source="email" />
            <TextField source="company" />
            <TextField source="phone" />
            <DateField source="created_at" />
            <EditButton />
        </Datagrid>
    </List>
);

const CustomerFilter = (props: any) => (
    <Filter {...props}>
        <TextInput label="Search" source="q" alwaysOn />
        <TextInput label="Company" source="company" />
        <DateInput label="Created After" source="created_at_gte" />
    </Filter>
);
```

**Limitations:**
- Frontend-only solution; requires separate backend API development
- Opinionated about REST API conventions; requires adapter layer for non-standard APIs
- Material-UI theming can be heavy for simple dashboards
- Enterprise features (realtime, RBAC granular permissions) require paid edition
- No built-in backend validation; relies entirely on API responses
- Can be overkill for very simple admin panels

---

### 1.2 refine (MIT) -- RECOMMENDED

| Attribute | Detail |
|-----------|--------|
| **Name** | refine |
| **Language** | TypeScript/React |
| **License** | MIT |
| **GitHub URL** | https://github.com/refinedev/refine |
| **Stars** | ~28,000+ |
| **Website** | https://refine.dev |

**Key Features:**
- Headless React framework for building internal tools, admin panels, dashboards & B2B apps
- Connectors for 15+ backend services (REST, GraphQL, NestJS CRUD, Airtable, Strapi, Supabase, etc.)
- SSR support with Next.js & Remix
- Built-in authentication and access control providers
- Auto-generation of CRUD UIs based on API data structure
- React Query integration for state management and mutations
- Real-time/live application support
- Audit logs & document versioning out of the box
- CLI tool for scaffolding (`npm create refine-app`)
- UI framework agnostic (works with Ant Design, Material-UI, Chakra UI, Mantine)
- Devtools for debugging and insights
- Fine-grained access control with `CanAccess` component
- Route-level and field-level permission checking

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: refine-compatible REST API with full CRUD + filtering
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, declarative_base
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import json
from datetime import datetime

# Database setup
Base = declarative_base()
engine = create_engine("postgresql://user:pass@localhost/deepsynaps")

# SQLAlchemy Models
class Organization(Base):
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    domain = Column(String(100), unique=True)
    plan = Column(String(20), default="free")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Contact(Base):
    __tablename__ = "contacts"
    id = Column(Integer, primary_key=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(200), unique=True, nullable=False)
    phone = Column(String(50))
    title = Column(String(100))
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    owner_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String(20), default="lead")  # lead, qualified, customer, churned
    score = Column(Integer, default=0)  # lead scoring 0-100
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Deal(Base):
    __tablename__ = "deals"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    value = Column(Float, default=0.0)
    currency = Column(String(3), default="USD")
    stage = Column(String(30), default="prospecting")
    probability = Column(Integer, default=0)  # 0-100
    expected_close_date = Column(DateTime(timezone=True))
    actual_close_date = Column(DateTime(timezone=True))
    contact_id = Column(Integer, ForeignKey("contacts.id"))
    owner_id = Column(Integer, ForeignKey("users.id"))
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    source = Column(String(50))  # web, referral, outbound, inbound
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(200), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    first_name = Column(String(100))
    last_name = Column(String(100))
    role = Column(String(20), default="member")  # admin, manager, member
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# Pydantic Schemas
class ContactCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    phone: Optional[str] = None
    title: Optional[str] = None
    organization_id: Optional[int] = None
    status: str = "lead"
    score: int = Field(default=0, ge=0, le=100)
    notes: Optional[str] = None

class ContactUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    organization_id: Optional[int] = None
    status: Optional[str] = None
    score: Optional[int] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = None

class ContactOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    phone: Optional[str]
    title: Optional[str]
    organization_id: Optional[int]
    status: str
    score: int
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# Generic CRUD Router Factory
def build_crud_router(
    router_prefix: str,
    model: type,
    create_schema: type,
    update_schema: type,
    response_schema: type,
    searchable_fields: List[str] = None,
    filterable_fields: List[str] = None,
    sortable_fields: List[str] = None
):
    router = APIRouter(prefix=f"/{router_prefix}", tags=[router_prefix])
    
    if searchable_fields is None:
        searchable_fields = ["name", "email", "title"]
    if filterable_fields is None:
        filterable_fields = ["status", "stage", "owner_id", "organization_id"]
    if sortable_fields is None:
        sortable_fields = ["id", "created_at", "updated_at", "name", "email"]

    @router.get("", response_model=Dict[str, Any])
    async def list_items(
        db: Session = Depends(get_db),
        start: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=1000),
        sort: str = Query("id"),
        order: str = Query("asc", pattern="^(asc|desc)$"),
        q: Optional[str] = None,
        filters: Optional[str] = None,  # JSON-encoded filters
    ):
        query = db.query(model)
        
        # Full-text search
        if q and searchable_fields:
            search_conditions = []
            for field_name in searchable_fields:
                if hasattr(model, field_name):
                    field = getattr(model, field_name)
                    search_conditions.append(field.ilike(f"%{q}%"))
            if search_conditions:
                from sqlalchemy import or_
                query = query.filter(or_(*search_conditions))
        
        # Structured filters (refine format)
        if filters:
            try:
                filter_dict = json.loads(filters)
                for key, value in filter_dict.items():
                    if hasattr(model, key):
                        column = getattr(model, key)
                        if isinstance(value, list):
                            query = query.filter(column.in_(value))
                        elif isinstance(value, dict):
                            # Range operators
                            for op, op_val in value.items():
                                if op == "gte":
                                    query = query.filter(column >= op_val)
                                elif op == "lte":
                                    query = query.filter(column <= op_val)
                                elif op == "gt":
                                    query = query.filter(column > op_val)
                                elif op == "lt":
                                    query = query.filter(column < op_val)
                                elif op == "ne":
                                    query = query.filter(column != op_val)
                                elif op == "contains":
                                    query = query.filter(column.ilike(f"%{op_val}%"))
                        else:
                            query = query.filter(column == value)
            except json.JSONDecodeError:
                pass
        
        # Sorting
        if sort and hasattr(model, sort):
            sort_col = getattr(model, sort)
            if order == "desc":
                sort_col = sort_col.desc()
            query = query.order_by(sort_col)
        
        # Pagination
        total = query.count()
        items = query.offset(start).limit(limit).all()
        
        return {
            "data": [response_schema.from_orm(item).dict() for item in items],
            "total": total,
            "pageInfo": {
                "hasNextPage": (start + limit) < total,
                "hasPreviousPage": start > 0
            }
        }

    @router.get("/{item_id}", response_model=response_schema)
    async def get_item(item_id: int, db: Session = Depends(get_db)):
        item = db.query(model).filter(model.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"{router_prefix} not found")
        return item

    @router.post("", response_model=response_schema, status_code=status.HTTP_201_CREATED)
    async def create_item(item: create_schema, db: Session = Depends(get_db)):
        db_item = model(**item.dict())
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item

    @router.put("/{item_id}", response_model=response_schema)
    async def update_item(item_id: int, item: update_schema, db: Session = Depends(get_db)):
        db_item = db.query(model).filter(model.id == item_id).first()
        if not db_item:
            raise HTTPException(status_code=404, detail=f"{router_prefix} not found")
        
        update_data = item.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_item, field, value)
        
        db.commit()
        db.refresh(db_item)
        return db_item

    @router.delete("/{item_id}")
    async def delete_item(item_id: int, db: Session = Depends(get_db)):
        db_item = db.query(model).filter(model.id == item_id).first()
        if not db_item:
            raise HTTPException(status_code=404, detail=f"{router_prefix} not found")
        db.delete(db_item)
        db.commit()
        return {"message": "Deleted successfully"}

    @router.post("/bulk-delete")
    async def bulk_delete(item_ids: List[int], db: Session = Depends(get_db)):
        deleted = db.query(model).filter(model.id.in_(item_ids)).delete(synchronize_session=False)
        db.commit()
        return {"deleted": deleted}

    @router.get("/meta/fields")
    async def get_metadata():
        """Return field metadata for dynamic form generation"""
        return {
            "fields": [
                {"name": f.name, "type": str(f.type), "nullable": f.nullable}
                for f in model.__table__.columns
            ]
        }

    return router

# Create routers
contact_router = build_crud_router(
    "contacts", Contact, ContactCreate, ContactUpdate, ContactOut,
    searchable_fields=["first_name", "last_name", "email", "phone", "title"],
    filterable_fields=["status", "organization_id", "owner_id"],
    sortable_fields=["id", "first_name", "last_name", "email", "status", "score", "created_at"]
)

deal_router = build_crud_router(
    "deals", Deal, DealCreate, DealUpdate, DealOut,
    searchable_fields=["title", "description"],
    filterable_fields=["stage", "status", "owner_id", "organization_id", "probability"],
    sortable_fields=["id", "title", "value", "probability", "expected_close_date", "created_at"]
)

# Main app
app = FastAPI(title="DeepSynaps CRM API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(contact_router)
app.include_router(deal_router)
```

```typescript
// refine Frontend: App.tsx with Ant Design
import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import {
    notificationProvider,
    ThemedLayoutV2,
    ErrorComponent,
} from "@refinedev/antd";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import dataProvider from "@refinedev/simple-rest";
import routerProvider from "@refinedev/react-router-v6";
import { useAuth0 } from "@auth0/auth0-react";
import { ContactList, ContactCreate, ContactEdit, ContactShow } from "./pages/contacts";
import { DealList, DealCreate, DealEdit, DealShow } from "./pages/deals";
import { DashboardPage } from "./pages/dashboard";
import { Header } from "./components/header";
import { Title } from "./components/title";
import "@refinedev/antd/dist/reset.css";

function App() {
    const { getAccessTokenSilently, isLoading, user } = useAuth0();
    
    const authProvider = {
        login: async () => { return { success: true }; },
        logout: async () => { return { success: true }; },
        check: async () => {
            try {
                await getAccessTokenSilently();
                return { authenticated: true };
            } catch {
                return { authenticated: false };
            }
        },
        getPermissions: async () => {
            return user?.role ? [user.role] : ["member"];
        },
        getIdentity: async () => ({
            id: user?.sub,
            name: user?.name,
            avatar: user?.picture,
        }),
    };

    // Custom data provider with auth token injection
    const customDataProvider = (apiUrl: string) => {
        const baseProvider = dataProvider(apiUrl);
        return {
            ...baseProvider,
            getList: async ({ resource, pagination, filters, sorters, meta }) => {
                const token = await getAccessTokenSilently();
                const url = new URL(`${apiUrl}/${resource}`);
                
                if (pagination) {
                    url.searchParams.append("start", String((pagination.current - 1) * pagination.pageSize));
                    url.searchParams.append("limit", String(pagination.pageSize));
                }
                
                if (sorters && sorters.length > 0) {
                    url.searchParams.append("sort", sorters[0].field);
                    url.searchParams.append("order", sorters[0].order);
                }
                
                if (filters && filters.length > 0) {
                    const filterObj: Record<string, any> = {};
                    filters.forEach(f => {
                        if ("field" in f) {
                            filterObj[f.field] = f.value;
                        }
                    });
                    url.searchParams.append("filters", JSON.stringify(filterObj));
                }

                const response = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await response.json();
                
                return {
                    data: data.data,
                    total: data.total,
                };
            },
        };
    };

    return (
        <BrowserRouter>
            <RefineKbarProvider>
                <Refine
                    dataProvider={customDataProvider("http://localhost:8000")}
                    notificationProvider={notificationProvider}
                    routerProvider={routerProvider}
                    authProvider={authProvider}
                    resources={[
                        {
                            name: "dashboard",
                            list: "/",
                            meta: { label: "Dashboard", icon: <DashboardOutlined /> },
                        },
                        {
                            name: "contacts",
                            list: "/contacts",
                            create: "/contacts/create",
                            edit: "/contacts/edit/:id",
                            show: "/contacts/show/:id",
                            meta: { label: "Contacts", icon: <TeamOutlined /> },
                        },
                        {
                            name: "deals",
                            list: "/deals",
                            create: "/deals/create",
                            edit: "/deals/edit/:id",
                            show: "/deals/show/:id",
                            meta: { label: "Deals Pipeline", icon: <DollarOutlined /> },
                        },
                    ]}
                >
                    <Routes>
                        <Route
                            element={
                                <ThemedLayoutV2 Header={Header} Title={Title}>
                                    <Outlet />
                                </ThemedLayoutV2>
                            }
                        >
                            <Route index element={<DashboardPage />} />
                            <Route path="/contacts">
                                <Route index element={<ContactList />} />
                                <Route path="create" element={<ContactCreate />} />
                                <Route path="edit/:id" element={<ContactEdit />} />
                                <Route path="show/:id" element={<ContactShow />} />
                            </Route>
                            <Route path="/deals">
                                <Route index element={<DealList />} />
                                <Route path="create" element={<DealCreate />} />
                                <Route path="edit/:id" element={<DealEdit />} />
                                <Route path="show/:id" element={<DealShow />} />
                            </Route>
                            <Route path="*" element={<ErrorComponent />} />
                        </Route>
                    </Routes>
                    <RefineKbar />
                </Refine>
            </RefineKbarProvider>
        </BrowserRouter>
    );
}

export default App;
```

**Limitations:**
- Steeper learning curve than React Admin due to architectural flexibility
- Headless nature requires choosing and configuring a UI framework
- Some advanced features require paid Refine Enterprise edition
- Community smaller than React Admin but growing rapidly
- Requires understanding of React Query patterns

---

### 1.3 AdminJS (MIT)

| Attribute | Detail |
|-----------|--------|
| **Name** | AdminJS |
| **Language** | TypeScript/Node.js |
| **License** | MIT |
| **GitHub URL** | https://github.com/SoftwareBrothers/adminjs |
| **Stars** | ~5,500+ |
| **Website** | https://adminjs.co |

**Key Features:**
- Auto-generated admin panel from database models/ORMs
- Supports Sequelize, TypeORM, Mongoose, Prisma, MikroORM, Objection
- Built with React + styled-components on frontend
- Customizable dashboard components
- Role-based access control
- Custom actions (export, send email, bulk operations)
- File upload handling
- WYSIWYG editor integration
- Custom component injection
- Internationalization support

**Integration Path with FastAPI + SQLAlchemy:**

Unlike other options, AdminJS is Node.js-based and cannot be directly embedded in a Python application. Two integration approaches:

**Option A: Separate AdminJS Service with FastAPI API Backend**

```python
# FastAPI: AdminJS-compatible JSON API
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import json

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

# AdminJS expects a specific JSON structure
# It queries /api/resources/{resource}/actions/list

@app.get("/api/resources/{resource}/actions/list")
async def admin_list(
    resource: str,
    page: int = 1,
    perPage: int = 10,
    sortBy: str = "id",
    direction: str = "asc",
    filters: Optional[str] = None,
    db: Session = Depends(get_db)
):
    model = RESOURCE_MAP.get(resource)
    if not model:
        return {"meta": {"total": 0}, "records": []}
    
    query = db.query(model)
    
    # Apply filters (AdminJS filter format)
    if filters:
        filter_dict = json.loads(filters)
        for field, filter_info in filter_dict.items():
            value = filter_info.get("value")
            if value and hasattr(model, field):
                query = query.filter(getattr(model, field) == value)
    
    total = query.count()
    
    # Apply sorting
    sort_col = getattr(model, sortBy, model.id)
    if direction == "desc":
        sort_col = sort_col.desc()
    query = query.order_by(sort_col)
    
    # Pagination
    offset = (page - 1) * perPage
    records = query.offset(offset).limit(perPage).all()
    
    return {
        "meta": {"total": total, "page": page, "perPage": perPage},
        "records": [model_to_dict(r) for r in records]
    }

@app.get("/api/resources/{resource}/actions/show/{record_id}")
async def admin_show(resource: str, record_id: int, db: Session = Depends(get_db)):
    model = RESOURCE_MAP.get(resource)
    record = db.query(model).filter(model.id == record_id).first()
    return {"record": model_to_dict(record) if record else None}

@app.post("/api/resources/{resource}/actions/new")
async def admin_create(resource: str, payload: Dict[str, Any], db: Session = Depends(get_db)):
    model = RESOURCE_MAP.get(resource)
    record = model(**payload.get("params", {}))
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"record": model_to_dict(record), "notice": {"message": "Created successfully", "type": "success"}}

@app.post("/api/resources/{resource}/actions/edit/{record_id}")
async def admin_update(resource: str, record_id: int, payload: Dict[str, Any], db: Session = Depends(get_db)):
    model = RESOURCE_MAP.get(resource)
    record = db.query(model).filter(model.id == record_id).first()
    if record:
        for key, value in payload.get("params", {}).items():
            setattr(record, key, value)
        db.commit()
        db.refresh(record)
    return {"record": model_to_dict(record), "notice": {"message": "Updated successfully", "type": "success"}}

@app.delete("/api/resources/{resource}/actions/delete/{record_id}")
async def admin_delete(resource: str, record_id: int, db: Session = Depends(get_db)):
    model = RESOURCE_MAP.get(resource)
    db.query(model).filter(model.id == record_id).delete()
    db.commit()
    return {"notice": {"message": "Deleted successfully", "type": "success"}}

# AdminJS adapter for FastAPI-style responses
@app.get("/api/resources")
async def admin_resources():
    return {
        "resources": [
            {"id": "contacts", "name": "Contacts", "navigation": {"icon": "Contact"}},
            {"id": "deals", "name": "Deals", "navigation": {"icon": "DollarSign"}},
            {"id": "organizations", "name": "Organizations", "navigation": {"icon": "Building"}},
        ]
    }
```

```javascript
// AdminJS Node.js Service (separate from FastAPI)
// adminjs-server.js
const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const express = require('express');

const app = express();

// Configure resources pointing to FastAPI backend
const customResource = (resourceId, name, fields) => ({
  resource: {
    id: resourceId,
    name: name,
    actions: {
      list: {
        handler: async (request, response, context) => {
          const { page, perPage, sortBy, direction, filters } = request.query;
          const res = await fetch(
            `http://fastapi:8000/api/resources/${resourceId}/actions/list?page=${page}&perPage=${perPage}&sortBy=${sortBy}&direction=${direction}&filters=${encodeURIComponent(filters || '{}')}`
          );
          return res.json();
        },
        component: AdminJS.bundle('./components/List'),
      },
      show: {
        handler: async (request, response, context) => {
          const { recordId } = request.params;
          const res = await fetch(
            `http://fastapi:8000/api/resources/${resourceId}/actions/show/${recordId}`
          );
          return res.json();
        },
      },
      new: {
        handler: async (request, response, context) => {
          const res = await fetch(
            `http://fastapi:8000/api/resources/${resourceId}/actions/new`,
            { method: 'POST', body: JSON.stringify(request.payload), headers: { 'Content-Type': 'application/json' } }
          );
          return res.json();
        },
      },
      edit: {
        handler: async (request, response, context) => {
          const { recordId } = request.params;
          const res = await fetch(
            `http://fastapi:8000/api/resources/${resourceId}/actions/edit/${recordId}`,
            { method: 'POST', body: JSON.stringify(request.payload), headers: { 'Content-Type': 'application/json' } }
          );
          return res.json();
        },
      },
      delete: {
        handler: async (request, response, context) => {
          const { recordId } = request.params;
          const res = await fetch(
            `http://fastapi:8000/api/resources/${resourceId}/actions/delete/${recordId}`,
            { method: 'DELETE' }
          );
          return res.json();
        },
      },
    },
    properties: fields.map(f => ({ name: f.name, type: f.type, isId: f.isId })),
  },
});

const admin = new AdminJS({
  resources: [
    customResource('contacts', 'Contacts', [
      { name: 'id', type: 'number', isId: true },
      { name: 'first_name', type: 'string' },
      { name: 'last_name', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'score', type: 'number' },
      { name: 'created_at', type: 'datetime' },
    ]),
    customResource('deals', 'Deals', [
      { name: 'id', type: 'number', isId: true },
      { name: 'title', type: 'string' },
      { name: 'value', type: 'number' },
      { name: 'stage', type: 'string' },
      { name: 'probability', type: 'number' },
      { name: 'expected_close_date', type: 'datetime' },
    ]),
  ],
  rootPath: '/admin',
  branding: {
    companyName: 'DeepSynaps CRM',
    logo: '/deepsynaps-logo.svg',
    softwareBrothers: false,
  },
});

const router = AdminJSExpress.buildRouter(admin);
app.use(admin.options.rootPath, router);

app.listen(3001, () => {
  console.log('AdminJS running on http://localhost:3001/admin');
});
```

**Limitations:**
- Requires Node.js runtime (separate from Python/FastAPI backend)
- Auto-generation works best with Node.js ORMs; Python SQLAlchemy requires custom adapter
- Heavier resource footprint than React-based alternatives
- Less flexible frontend customization compared to React Admin/refine
- Documentation can be sparse for advanced customizations
- Tight coupling to Express.js for the admin server

---

### 1.4 Appsmith (Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Appsmith |
| **Language** | Java/TypeScript/React |
| **License** | Apache 2.0 |
| **GitHub URL** | https://github.com/appsmithorg/appsmith |
| **Stars** | ~34,000+ (as of early 2024) |
| **Website** | https://www.appsmith.com |

**Key Features:**
- Low-code platform for building internal tools and admin panels
- Drag-and-drop UI builder with 45+ pre-built widgets
- Direct database connections (PostgreSQL, MySQL, MongoDB, etc.)
- REST/GraphQL API integration
- JavaScript-based logic and data binding
- Role-based access control
- Git-based version control
- Self-hosted or cloud deployment
- Real-time collaboration
- Custom JS libraries support
- Auto-generated forms from database schemas
- Query builder with parameterized queries
- Scheduled cron jobs

**Integration Path with FastAPI + SQLAlchemy:**

Appsmith connects directly to the PostgreSQL database and/or FastAPI REST endpoints.

```python
# FastAPI: Appsmith-optimized API endpoints
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"])

# Appsmith connects to these endpoints
# In Appsmith UI, create a new API datasource pointing to http://your-fastapi:8000

@app.get("/api/v1/appsmith/contacts")
async def appsmith_contacts(
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
    search: Optional[str] = None,
    status: Optional[str] = None,
    owner_id: Optional[int] = None
):
    """
    Appsmith Table widget expects: [{"id": 1, "name": "...", ...}, ...]
    Appsmith connects via API and binds: {{ fetch_contacts.data }}
    """
    query = db.query(Contact)
    
    if search:
        query = query.filter(
            or_(
                Contact.first_name.ilike(f"%{search}%"),
                Contact.last_name.ilike(f"%{search}%"),
                Contact.email.ilike(f"%{search}%")
            )
        )
    
    if status:
        query = query.filter(Contact.status == status)
    
    if owner_id:
        query = query.filter(Contact.owner_id == owner_id)
    
    total = query.count()
    records = query.limit(limit).offset(offset).all()
    
    return {
        "data": [contact.to_dict() for contact in records],
        "total": total,
        "limit": limit,
        "offset": offset
    }

@app.post("/api/v1/appsmith/contacts")
async def appsmith_create_contact(payload: Dict[str, Any], db: Session = Depends(get_db)):
    """Appsmith Form widget submits to this endpoint"""
    contact = Contact(**payload)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return {"success": True, "data": contact.to_dict(), "message": "Contact created"}

@app.put("/api/v1/appsmith/contacts/{contact_id}")
async def appsmith_update_contact(contact_id: int, payload: Dict[str, Any], db: Session = Depends(get_db)):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404)
    for key, value in payload.items():
        setattr(contact, key, value)
    db.commit()
    db.refresh(contact)
    return {"success": True, "data": contact.to_dict(), "message": "Contact updated"}

@app.delete("/api/v1/appsmith/contacts/{contact_id}")
async def appsmith_delete_contact(contact_id: int, db: Session = Depends(get_db)):
    db.query(Contact).filter(Contact.id == contact_id).delete()
    db.commit()
    return {"success": True, "message": "Contact deleted"}

# Aggregation endpoints for Appsmith Chart widgets
@app.get("/api/v1/appsmith/dashboard/metrics")
async def appsmith_dashboard_metrics(db: Session = Depends(get_db)):
    """
    Returns aggregated metrics for Appsmith Chart/Stat widgets
    """
    total_contacts = db.query(func.count(Contact.id)).scalar()
    total_deals = db.query(func.count(Deal.id)).scalar()
    total_value = db.query(func.sum(Deal.value)).filter(Deal.stage == "closed_won").scalar() or 0
    
    # Pipeline distribution for pie chart
    pipeline_data = db.query(
        Deal.stage,
        func.count(Deal.id).label("count"),
        func.sum(Deal.value).label("value")
    ).group_by(Deal.stage).all()
    
    # Monthly revenue trend for line chart
    monthly_revenue = db.execute(text("""
        SELECT DATE_TRUNC('month', created_at) as month, SUM(value) as revenue
        FROM deals WHERE stage = 'closed_won'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC LIMIT 12
    """)).fetchall()
    
    return {
        "kpi": {
            "total_contacts": total_contacts,
            "total_deals": total_deals,
            "total_revenue": float(total_value),
            "avg_deal_size": float(total_value / total_deals) if total_deals else 0
        },
        "pipeline": [{"stage": row.stage, "count": row.count, "value": float(row.value or 0)} for row in pipeline_data],
        "monthly_revenue": [{"month": str(row.month), "revenue": float(row.revenue or 0)} for row in monthly_revenue]
    }

# Direct DB connection alternative
# Appsmith can connect directly to PostgreSQL without FastAPI:
# In Appsmith: Create Datasource > PostgreSQL > Host: db, Port: 5432, Database: deepsynaps
# Then write SQL queries directly in Appsmith:
# SELECT * FROM contacts WHERE status = {{ status_filter.selectedOptionValue }}
```

```javascript
// Appsmith JavaScript snippets for UI binding
// These run inside Appsmith's low-code environment

// Fetch contacts on page load
{{ fetch_contacts.run() }}

// Filter contacts by status
{{ fetch_contacts.run({ status: statusSelect.selectedOptionValue }) }}

// Search contacts
{{ fetch_contacts.run({ search: searchInput.text }) }}

// Create contact from form
{{ create_contact.run({
    first_name: firstNameInput.text,
    last_name: lastNameInput.text,
    email: emailInput.text,
    status: statusSelect.selectedOptionValue
}) }}

// Update deal stage (Kanban drag-and-drop)
{{ update_deal.run({ 
    deal_id: draggedItem.id, 
    stage: targetColumn.status 
}) }}

// Dashboard metrics
{{ fetch_metrics.run() }}
// Bind to Stat widget: {{ fetch_metrics.data.kpi.total_revenue }}
// Bind to Pie Chart: {{ fetch_metrics.data.pipeline }}
// Bind to Line Chart: {{ fetch_metrics.data.monthly_revenue }}
```

**Limitations:**
- Low-code approach may feel restrictive to experienced developers
- Generated applications have vendor-specific lock-in
- Self-hosted deployment requires significant resources (Java backend)
- Limited version control for complex applications
- JavaScript-only for business logic (no Python support)
- Performance can degrade with large datasets without pagination
- Not ideal for customer-facing applications

---

### 1.5 ToolJet (AGPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | ToolJet |
| **Language** | JavaScript/React/Node.js |
| **License** | AGPL-3.0 |
| **GitHub URL** | https://github.com/ToolJet/ToolJet |
| **Stars** | ~28,000+ |
| **Website** | https://tooljet.com |

**Key Features:**
- Open-source Retool alternative
- Visual app builder with drag-and-drop interface
- Connects to 50+ data sources (databases, APIs, SaaS tools)
- Custom JavaScript/Python code support
- Built-in database (PostgreSQL-based)
- Multi-page applications
- Version control with Git sync
- Role-based access control
- Marketplace with 40+ plugins
- Self-hosted with Docker/Kubernetes
- Real-time collaboration
- Mobile-responsive layouts
- Scheduled jobs and workflows
- Custom component development

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: ToolJet-compatible REST API
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# ToolJet connects via REST API datasource
# In ToolJet: Datasources > Add > REST API > http://fastapi:8000

# ToolJet expects standard REST patterns
# For ToolJet Table widget: GET endpoint returning array
# For ToolJet Form: POST/PUT endpoints

@app.get("/api/tooljet/contacts")
async def tooljet_get_contacts(
    db: Session = Depends(get_db),
    page: int = 1,
    per_page: int = 50,
    search: Optional[str] = None,
    status: Optional[str] = None
):
    query = db.query(Contact)
    if search:
        query = query.filter(
            or_(Contact.first_name.ilike(f"%{search}%"),
                Contact.last_name.ilike(f"%{search}%"),
                Contact.email.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(Contact.status == status)
    
    total = query.count()
    contacts = query.offset((page - 1) * per_page).limit(per_page).all()
    
    # ToolJet Table expects array of objects
    return [contact.to_dict() for contact in contacts]

@app.get("/api/tooljet/contacts/{contact_id}")
async def tooljet_get_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404)
    return contact.to_dict()

@app.post("/api/tooljet/contacts")
async def tooljet_create_contact(data: dict, db: Session = Depends(get_db)):
    contact = Contact(**data)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact.to_dict()

@app.put("/api/tooljet/contacts/{contact_id}")
async def tooljet_update_contact(contact_id: int, data: dict, db: Session = Depends(get_db)):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404)
    for key, value in data.items():
        setattr(contact, key, value)
    db.commit()
    db.refresh(contact)
    return contact.to_dict()

@app.delete("/api/tooljet/contacts/{contact_id}")
async def tooljet_delete_contact(contact_id: int, db: Session = Depends(get_db)):
    db.query(Contact).filter(Contact.id == contact_id).delete()
    db.commit()
    return {"deleted": True}

# ToolJet can run Python code in transformations
# In ToolJet: Query > Transformation > Python
"""
# ToolJet Python transformation example
# Transform API response for Chart widget
def transform(data):
    return {
        "labels": [item["stage"] for item in data],
        "datasets": [{
            "data": [item["value"] for item in data],
            "backgroundColor": ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0"]
        }]
    }
"""
```

**Limitations:**
- AGPL license requires open-sourcing derivative works (commercial risk)
- Less mature ecosystem than Appsmith
- Python code execution is limited to transformations (not full backend)
- Performance overhead for real-time applications
- Limited debugging capabilities for complex queries
- Self-hosted deployment can be resource-intensive
- UI component library smaller than commercial alternatives

---

## Admin Dashboard Frameworks Comparison

| Feature | React Admin | refine | AdminJS | Appsmith | ToolJet |
|---------|------------|--------|---------|----------|---------|
| **License** | MIT | MIT | MIT | Apache 2.0 | AGPL-3.0 |
| **Stars** | 25K+ | 28K+ | 5.5K+ | 34K+ | 28K+ |
| **Language** | TS/React | TS/React | TS/Node | Java/React | JS/React |
| **Approach** | Code-first | Code-first | Auto-gen | Low-code | Low-code |
| **UI Framework** | MUI | Any (Antd, MUI, etc.) | Custom styled | Custom | Custom |
| **FastAPI Integration** | REST API | REST/GraphQL | Custom adapter | REST/DB direct | REST/DB direct |
| **Learning Curve** | Medium | Medium-High | Low-Medium | Low | Low |
| **Customizability** | High | Very High | Medium | Medium | Medium |
| **Self-hosted** | Yes | Yes | Yes | Yes | Yes |
| **Real-time** | Addon | Built-in | No | Limited | Limited |
| **RBAC** | Enterprise | Built-in | Built-in | Built-in | Built-in |
| **Export** | CSV built-in | CSV/Excel | CSV | CSV/Excel/PDF | CSV/Excel |
| **Mobile Responsive** | Yes | Yes | Yes | Yes | Yes |
| **Best For** | Custom admin | Enterprise apps | Quick admin | Internal tools | Retool alternative |
| **DeepSynaps Fit** | Good | **Excellent** | Moderate | Good | Fair (license) |

---

## 2. Analytics & BI

### 2.1 Metabase (AGPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Metabase |
| **Language** | Clojure/JavaScript |
| **License** | AGPL-3.0 |
| **GitHub URL** | https://github.com/metabase/metabase |
| **Stars** | 47,300+ |
| **Website** | https://www.metabase.com |

**Key Features:**
- Intuitive visual query builder (no SQL required)
- Native SQL editor with autocomplete
- Interactive dashboards with drill-through
- 15+ visualization types (tables, charts, maps, gauges)
- Automated email and Slack reporting (pulses)
- Embedding and white-labeling (Enterprise)
- Collections for organizing questions and dashboards
- Row-level security and sandboxing
- User groups and permissions
- X-ray: automatic insights generation
- Public sharing and signed embedding
- REST API for programmatic access
- Support for PostgreSQL, MySQL, MongoDB, BigQuery, Snowflake, and 20+ others
- Alerting on goal thresholds
- Model definitions for reusable business logic

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Metabase embedding and API integration
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
import jwt
import time
from datetime import datetime, timedelta

METABASE_SECRET_KEY = "your-metabase-embedding-secret"
METABASE_SITE_URL = "http://localhost:3000"

class DashboardEmbedRequest(BaseModel):
    dashboard_id: int
    params: dict = {}

@app.post("/api/v1/analytics/embed-dashboard")
async def embed_metabase_dashboard(
    request: DashboardEmbedRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate signed JWT for Metabase embedded dashboard.
    DeepSynaps frontend uses this to render Metabase iframes securely.
    """
    payload = {
        "resource": {"dashboard": request.dashboard_id},
        "params": {
            # Pass user context for row-level security
            "user_id": str(current_user.id),
            "organization_id": str(current_user.organization_id),
            "role": current_user.role,
            **request.params
        },
        "exp": int(time.time()) + (60 * 10)  # 10 minute expiry
    }
    
    token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")
    iframe_url = f"{METABASE_SITE_URL}/embed/dashboard/{token}#bordered=true&titled=true"
    
    return {
        "iframe_url": iframe_url,
        "expires_at": datetime.utcnow() + timedelta(minutes=10)
    }

@app.post("/api/v1/analytics/embed-question")
async def embed_metabase_question(
    question_id: int,
    current_user: User = Depends(get_current_user)
):
    """Embed a single Metabase question/card"""
    payload = {
        "resource": {"question": question_id},
        "params": {
            "user_id": str(current_user.id),
            "organization_id": str(current_user.organization_id)
        },
        "exp": int(time.time()) + (60 * 10)
    }
    
    token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")
    iframe_url = f"{METABASE_SITE_URL}/embed/question/{token}#bordered=true"
    
    return {"iframe_url": iframe_url}

# Direct Metabase API proxy for programmatic queries
@app.get("/api/v1/analytics/metrics")
async def get_analytics_metrics(
    metric_type: str = "pipeline",  # pipeline, revenue, activity, forecasting
    period: str = "30d",  # 7d, 30d, 90d, 1y
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Serve pre-computed analytics that Metabase also queries.
    This keeps analytics consistent between embedded Metabase and DeepSynaps UI.
    """
    org_filter = f"AND organization_id = {current_user.organization_id}"
    
    if metric_type == "pipeline":
        result = db.execute(text(f"""
            SELECT 
                stage,
                COUNT(*) as deal_count,
                SUM(value) as total_value,
                AVG(value) as avg_value,
                AVG(probability) as avg_probability
            FROM deals
            WHERE created_at >= NOW() - INTERVAL '{period}'
            {org_filter}
            GROUP BY stage
            ORDER BY 
                CASE stage
                    WHEN 'prospecting' THEN 1
                    WHEN 'qualification' THEN 2
                    WHEN 'proposal' THEN 3
                    WHEN 'negotiation' THEN 4
                    WHEN 'closed_won' THEN 5
                    WHEN 'closed_lost' THEN 6
                END
        """)).fetchall()
        
        return {
            "pipeline_stages": [
                {
                    "stage": row.stage,
                    "deal_count": row.deal_count,
                    "total_value": float(row.total_value or 0),
                    "avg_value": float(row.avg_value or 0),
                    "avg_probability": float(row.avg_probability or 0),
                    "weighted_forecast": float(row.total_value or 0) * (float(row.avg_probability or 0) / 100)
                }
                for row in result
            ]
        }
    
    elif metric_type == "revenue":
        result = db.execute(text(f"""
            SELECT 
                DATE_TRUNC('month', actual_close_date) as month,
                SUM(value) as revenue,
                COUNT(*) as closed_deals,
                AVG(days_to_close) as avg_sales_cycle
            FROM deals
            WHERE stage = 'closed_won'
            AND actual_close_date >= NOW() - INTERVAL '{period}'
            {org_filter}
            GROUP BY DATE_TRUNC('month', actual_close_date)
            ORDER BY month
        """)).fetchall()
        
        return {
            "monthly_revenue": [
                {
                    "month": str(row.month),
                    "revenue": float(row.revenue or 0),
                    "closed_deals": row.closed_deals,
                    "avg_sales_cycle": float(row.avg_sales_cycle or 0)
                }
                for row in result
            ]
        }
    
    elif metric_type == "activity":
        result = db.execute(text(f"""
            SELECT 
                activity_type,
                COUNT(*) as count,
                DATE_TRUNC('week', created_at) as week
            FROM activities
            WHERE created_at >= NOW() - INTERVAL '{period}'
            {org_filter}
            GROUP BY activity_type, DATE_TRUNC('week', created_at)
            ORDER BY week, activity_type
        """)).fetchall()
        
        return {
            "activity_breakdown": [
                {"activity_type": row.activity_type, "count": row.count, "week": str(row.week)}
                for row in result
            ]
        }
    
    elif metric_type == "forecasting":
        # Simple linear regression forecast using SQL
        result = db.execute(text(f"""
            WITH monthly_revenue AS (
                SELECT 
                    EXTRACT(EPOCH FROM DATE_TRUNC('month', actual_close_date)) as month_epoch,
                    SUM(value) as revenue
                FROM deals
                WHERE stage = 'closed_won'
                AND actual_close_date >= NOW() - INTERVAL '12 months'
                {org_filter}
                GROUP BY DATE_TRUNC('month', actual_close_date)
                ORDER BY month_epoch
            ),
            regression AS (
                SELECT 
                    REGR_SLOPE(revenue, month_epoch) as slope,
                    REGR_INTERCEPT(revenue, month_epoch) as intercept
                FROM monthly_revenue
            )
            SELECT 
                r.slope,
                r.intercept,
                (r.slope * EXTRACT(EPOCH FROM DATE_TRUNC('month', NOW() + INTERVAL '1 month')) + r.intercept) as next_month_forecast,
                (r.slope * EXTRACT(EPOCH FROM DATE_TRUNC('month', NOW() + INTERVAL '3 months')) + r.intercept) as quarter_forecast
            FROM regression r
        """)).fetchone()
        
        return {
            "forecast": {
                "slope": float(result.slope) if result else 0,
                "next_month_forecast": float(result.next_month_forecast) if result else 0,
                "quarter_forecast": float(result.quarter_forecast) if result else 0,
                "confidence": "medium",  # Could calculate R-squared
                "method": "linear_regression"
            }
        }
    
    return {"error": "Unknown metric type"}

# Webhook endpoint for Metabase to push alerts to DeepSynaps
@app.post("/api/v1/analytics/webhooks/metabase")
async def metabase_webhook(payload: dict):
    """
    Receive Metabase alert webhooks and route to DeepSynaps notification system.
    """
    alert_type = payload.get("alert_type")
    question_id = payload.get("question_id")
    results = payload.get("results", {})
    
    # Log the alert
    await notification_service.send_notification(
        type="analytics_alert",
        title=f"Metabase Alert: {alert_type}",
        body=f"Question {question_id} triggered alert. Results: {json.dumps(results)}",
        channels=["in_app", "email"]
    )
    
    return {"status": "processed"}
```

**Metabase Configuration for DeepSynaps:**

```sql
-- Metabase should connect to the same PostgreSQL database as FastAPI
-- Set up these views for cleaner analytics queries

CREATE VIEW metabase.deals_pipeline AS
SELECT 
    d.id,
    d.title,
    d.value,
    d.currency,
    d.stage,
    d.probability,
    d.expected_close_date,
    d.actual_close_date,
    d.source,
    c.first_name || ' ' || c.last_name as contact_name,
    c.email as contact_email,
    o.name as organization_name,
    u.first_name || ' ' || u.last_name as owner_name,
    d.created_at,
    d.updated_at,
    CASE 
        WHEN d.actual_close_date IS NOT NULL 
        THEN EXTRACT(DAY FROM (d.actual_close_date - d.created_at))
        ELSE NULL 
    END as days_to_close
FROM deals d
LEFT JOIN contacts c ON d.contact_id = c.id
LEFT JOIN organizations o ON d.organization_id = o.id
LEFT JOIN users u ON d.owner_id = u.id;

CREATE VIEW metabase.contact_lifecycle AS
SELECT 
    c.id,
    c.first_name || ' ' || c.last_name as full_name,
    c.email,
    c.status,
    c.score,
    o.name as organization,
    COUNT(d.id) as deal_count,
    COALESCE(SUM(CASE WHEN d.stage = 'closed_won' THEN d.value ELSE 0 END), 0) as lifetime_value,
    MAX(d.actual_close_date) as last_purchase_date,
    c.created_at,
    EXTRACT(DAY FROM (NOW() - c.created_at)) as days_since_creation
FROM contacts c
LEFT JOIN organizations o ON c.organization_id = o.id
LEFT JOIN deals d ON d.contact_id = c.id
GROUP BY c.id, o.name;

CREATE VIEW metabase.user_performance AS
SELECT 
    u.id,
    u.first_name || ' ' || u.last_name as full_name,
    u.email,
    u.role,
    COUNT(DISTINCT d.id) as deals_managed,
    SUM(CASE WHEN d.stage = 'closed_won' THEN d.value ELSE 0 END) as revenue_won,
    SUM(CASE WHEN d.stage = 'closed_lost' THEN d.value ELSE 0 END) as revenue_lost,
    COUNT(DISTINCT c.id) as contacts_managed,
    AVG(CASE WHEN d.stage = 'closed_won' 
        THEN EXTRACT(DAY FROM (d.actual_close_date - d.created_at)) 
        END) as avg_close_days
FROM users u
LEFT JOIN deals d ON d.owner_id = u.id
LEFT JOIN contacts c ON c.owner_id = u.id
GROUP BY u.id;

-- Enable row-level security context for Metabase
CREATE OR REPLACE FUNCTION metabase.current_org_id()
RETURNS INTEGER AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_org_id', TRUE), '')::INTEGER;
END;
$$ LANGUAGE plpgsql;
```

**Limitations:**
- AGPL license requires careful handling for SaaS offerings
- Embedding requires Enterprise license for full white-labeling
- Heavy JVM-based backend (Clojure/Java)
- Limited real-time capabilities
- Query builder has learning curve for complex joins
- Dashboard interactivity limited compared to custom solutions
- Can become slow with very large datasets without optimization

---

### 2.2 Apache Superset (Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Apache Superset |
| **Language** | Python/React |
| **License** | Apache 2.0 |
| **GitHub URL** | https://github.com/apache/superset |
| **Stars** | 63,000+ |
| **Website** | https://superset.apache.org |

**Key Features:**
- Enterprise-grade BI platform from Apache Software Foundation
- 40+ chart types including geospatial visualizations
- SQL Lab: powerful SQL IDE with autocomplete and query history
- Drag-and-drop chart builder (Explore view)
- Rich semantic layer for defining custom dimensions and metrics
- Dashboard composition with tabs, filters, and cross-filtering
- Row-level security with custom filter clauses
- Caching layer (Redis/Memcached) for query performance
- Asynchronous query execution via Celery workers
- REST API for programmatic dashboard/chart management
- Embedding via guest token mechanism
- Integration with Apache Druid, ClickHouse, Pinot for real-time
- Plugin architecture for custom visualizations
- Alerts and reports scheduling
- Jinja templating in SQL queries
- CSV/JSON/Excel export

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Superset integration via REST API and embedding
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
import requests
from datetime import datetime, timedelta
import jwt

SUPerset_URL = "http://superset:8088"
SUPERSET_ADMIN_USER = "admin"
SUPERSET_ADMIN_PASSWORD = "admin"
SUPERSET_SECRET_KEY = "your-superset-secret"

class ChartRequest(BaseModel):
    datasource_id: int
    viz_type: str = "table"
    metrics: list = []
    groupby: list = []
    since: str = "30 days ago"
    until: str = "now"
    filters: list = []

# Superset authentication and session management
class SupersetClient:
    def __init__(self):
        self.base_url = SUPerset_URL
        self.session = requests.Session()
        self._login()
    
    def _login(self):
        response = self.session.post(
            f"{self.base_url}/api/v1/security/login",
            json={
                "username": SUPERSET_ADMIN_USER,
                "password": SUPERSET_ADMIN_PASSWORD,
                "provider": "db",
                "refresh": True
            }
        )
        data = response.json()
        self.access_token = data["access_token"]
        self.refresh_token = data["refresh_token"]
        self.session.headers.update({
            "Authorization": f"Bearer {self.access_token}"
        })
    
    def get_csrf_token(self):
        response = self.session.get(f"{self.base_url}/api/v1/security/csrf_token/")
        return response.json()["result"]
    
    def create_guest_token(self, resources: list, rls: list = None):
        """Create guest token for embedded dashboards"""
        response = self.session.post(
            f"{self.base_url}/api/v1/security/guest_token/",
            json={
                "user": {
                    "username": "embedded_user",
                    "first_name": "Embedded",
                    "last_name": "User"
                },
                "resources": resources,
                "rls": rls or []
            }
        )
        return response.json()["token"]

superset_client = SupersetClient()

@app.post("/api/v1/analytics/superset/chart-data")
async def get_chart_data(request: ChartRequest):
    """
    Proxy chart data requests to Superset for custom DeepSynaps visualizations.
    """
    csrf_token = superset_client.get_csrf_token()
    
    payload = {
        "datasource": {"id": request.datasource_id, "type": "table"},
        "viz_type": request.viz_type,
        "metrics": request.metrics,
        "groupby": request.groupby,
        "since": request.since,
        "until": request.until,
        "adhoc_filters": request.filters,
        "row_limit": 10000
    }
    
    response = superset_client.session.post(
        f"{superset_client.base_url}/api/v1/chart/data",
        json={"query_context": payload},
        headers={"X-CSRFToken": csrf_token}
    )
    
    return response.json()

@app.post("/api/v1/analytics/superset/embed-dashboard")
async def embed_superset_dashboard(dashboard_id: int):
    """
    Generate guest token for embedded Superset dashboard.
    """
    resources = [{"type": "dashboard", "id": dashboard_id}]
    
    # Row-level security filters based on user context
    rls = [
        {"dataset": 1, "clause": f"organization_id = {{% if g.user %}}{g.user.organization_id}{{% else %}}1{{% endif %}}"}
    ]
    
    guest_token = superset_client.create_guest_token(resources, rls)
    
    return {
        "guest_token": guest_token,
        "superset_url": SUPerset_URL,
        "dashboard_id": dashboard_id
    }

# Frontend receives guest_token and renders:
# <iframe src="http://superset:8088/superset/dashboard/{dashboard_id}/?standalone=true&guest_token={guest_token}">

# Sync DeepSynaps database schema with Superset
@app.post("/api/v1/analytics/superset/sync-datasets")
async def sync_superset_datasets():
    """
    Automatically register DeepSynaps tables as Superset datasets.
    """
    csrf_token = superset_client.get_csrf_token()
    
    tables = ["contacts", "deals", "organizations", "activities", "users"]
    created_datasets = []
    
    for table in tables:
        payload = {
            "database": 1,  # PostgreSQL database ID in Superset
            "schema": "public",
            "table_name": table,
            "normalize_columns": False
        }
        
        response = superset_client.session.post(
            f"{superset_client.base_url}/api/v1/dataset/",
            json=payload,
            headers={"X-CSRFToken": csrf_token}
        )
        
        if response.status_code in (201, 422):  # 422 may mean already exists
            created_datasets.append({"table": table, "status": "synced"})
    
    return {"synced_datasets": created_datasets}

# Custom Superset visualization for CRM pipeline
@app.get("/api/v1/analytics/superset/pipeline-funnel")
async def get_pipeline_funnel(
    period: str = "90d",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return pipeline funnel data formatted for Superset ECharts visualization.
    """
    stages = ["prospecting", "qualification", "proposal", "negotiation", "closed_won"]
    results = []
    
    for stage in stages:
        row = db.execute(text("""
            SELECT 
                COUNT(*) as count,
                SUM(value) as total_value,
                AVG(value) as avg_value
            FROM deals
            WHERE stage = :stage
            AND organization_id = :org_id
            AND created_at >= NOW() - INTERVAL :period
        """), {
            "stage": stage,
            "org_id": current_user.organization_id,
            "period": period
        }).fetchone()
        
        results.append({
            "stage": stage,
            "count": row.count,
            "total_value": float(row.total_value or 0),
            "avg_value": float(row.avg_value or 0)
        })
    
    return {"funnel_data": results}
```

**Limitations:**
- Steeper setup and configuration than Metabase
- Requires Celery + Redis + PostgreSQL for full functionality
- Heavy resource footprint (multiple Python services)
- Embedding requires understanding of guest token mechanism
- Jinja templating has security implications if misconfigured
- Chart builder UX less intuitive than Metabase for non-technical users
- Documentation can be scattered across versions

---

### 2.3 Cube.js (MIT/Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Cube Core |
| **Language** | Rust/TypeScript |
| **License** | MIT (client) / Apache 2.0 (backend) |
| **GitHub URL** | https://github.com/cube-js/cube |
| **Stars** | 17,500+ |
| **Website** | https://cube.dev |

**Key Features:**
- Universal semantic layer for AI, BI, and embedded analytics
- Schema-driven API: define metrics once, use everywhere
- Automatic REST and GraphQL API generation from data schema
- Query caching with Redis/Memcached
- Pre-aggregations for sub-second query performance
- Multi-tenancy with dynamic data source selection
- SQL generation for 10+ databases (PostgreSQL, BigQuery, Snowflake, etc.)
- Real-time data support via Lambda architecture
- Security context for row-level security
- Data blending across multiple sources
- Orchestration API for cache warming
- Native integration with React, Vue, Angular
- Playground UI for testing queries
- Export to CSV, JSON, XLSX

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Cube.js integration via REST API
# Cube.js runs as a separate service; FastAPI proxies and extends

from fastapi import FastAPI, Depends
from pydantic import BaseModel
import requests
from typing import Dict, Any, List, Optional

CUBE_API_URL = "http://cube:4000"
CUBE_API_SECRET = "your-cube-secret"

class CubeQueryRequest(BaseModel):
    measures: List[str]
    dimensions: Optional[List[str]] = None
    filters: Optional[List[Dict]] = None
    timeDimensions: Optional[List[Dict]] = None
    order: Optional[Dict[str, str]] = None
    limit: int = 10000

def generate_cube_token(user: User) -> str:
    """Generate JWT security context for Cube.js with user org filtering"""
    import jwt
    
    payload = {
        "sub": str(user.id),
        "organization_id": str(user.organization_id),
        "role": user.role,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=1)
    }
    
    return jwt.encode(payload, CUBE_API_SECRET, algorithm="HS256")

@app.post("/api/v1/analytics/cube/load")
async def cube_load(
    request: CubeQueryRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Proxy queries to Cube.js with user security context.
    DeepSynaps frontend uses this for embedded analytics.
    """
    token = generate_cube_token(current_user)
    
    payload = {
        "query": request.dict(exclude_none=True),
        "queryType": "multi"
    }
    
    response = requests.post(
        f"{CUBE_API_URL}/cubejs-api/v1/load",
        json=payload,
        headers={"Authorization": token}
    )
    
    return response.json()

@app.get("/api/v1/analytics/cube/meta")
async def cube_meta(current_user: User = Depends(get_current_user)):
    """Get Cube.js data schema for building dynamic UI components"""
    token = generate_cube_token(current_user)
    
    response = requests.get(
        f"{CUBE_API_URL}/cubejs-api/v1/meta",
        headers={"Authorization": token}
    )
    
    return response.json()

# Cube.js schema definition for DeepSynaps CRM
# cube.js file (placed in Cube.js service)
"""
// cube/schema/Contacts.js
cube('Contacts', {
  sql_table: 'public.contacts',
  
  joins: {
    Organizations: {
      relationship: 'belongsTo',
      sql: `${CUBE}.organization_id = ${Organizations}.id`
    },
    Deals: {
      relationship: 'hasMany',
      sql: `${CUBE}.id = ${Deals}.contact_id`
    }
  },
  
  measures: {
    count: {
      type: 'count',
      drillMembers: [id, first_name, last_name, created_at]
    },
    
    avgScore: {
      type: 'avg',
      sql: 'score',
      title: 'Average Lead Score'
    },
    
    lifetimeValue: {
      type: 'sum',
      sql: `${Deals.value}`,
      filters: [{ sql: `${Deals.stage} = 'closed_won'` }]
    }
  },
  
  dimensions: {
    id: {
      sql: 'id',
      type: 'number',
      primaryKey: true
    },
    
    first_name: {
      sql: 'first_name',
      type: 'string'
    },
    
    last_name: {
      sql: 'last_name',
      type: 'string'
    },
    
    email: {
      sql: 'email',
      type: 'string'
    },
    
    status: {
      sql: 'status',
      type: 'string'
    },
    
    organization_id: {
      sql: 'organization_id',
      type: 'number',
      shown: false
    },
    
    created_at: {
      sql: 'created_at',
      type: 'time'
    }
  },
  
  segments: {
    qualified: {
      sql: `${CUBE}.status = 'qualified'`
    },
    customers: {
      sql: `${CUBE}.status = 'customer'`
    }
  },
  
  pre_aggregations: {
    contactsByStatus: {
      measures: [count, avgScore],
      dimensions: [status],
      timeDimension: created_at,
      granularity: 'day'
    }
  }
});

// cube/schema/Deals.js
cube('Deals', {
  sql_table: 'public.deals',
  
  joins: {
    Contacts: {
      relationship: 'belongsTo',
      sql: `${CUBE}.contact_id = ${Contacts}.id`
    },
    Organizations: {
      relationship: 'belongsTo',
      sql: `${CUBE}.organization_id = ${Organizations}.id`
    }
  },
  
  measures: {
    count: {
      type: 'count'
    },
    
    totalValue: {
      type: 'sum',
      sql: 'value',
      title: 'Total Pipeline Value'
    },
    
    avgDealSize: {
      type: 'avg',
      sql: 'value',
      title: 'Average Deal Size'
    },
    
    weightedForecast: {
      type: 'sum',
      sql: 'value * probability / 100',
      title: 'Weighted Forecast'
    },
    
    winRate: {
      type: 'number',
      sql: `SUM(CASE WHEN stage = 'closed_won' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)`,
      title: 'Win Rate %'
    }
  },
  
  dimensions: {
    id: {
      sql: 'id',
      type: 'number',
      primaryKey: true
    },
    
    stage: {
      sql: 'stage',
      type: 'string'
    },
    
    source: {
      sql: 'source',
      type: 'string'
    },
    
    value: {
      sql: 'value',
      type: 'number'
    },
    
    probability: {
      sql: 'probability',
      type: 'number'
    },
    
    expectedCloseDate: {
      sql: 'expected_close_date',
      type: 'time'
    },
    
    createdAt: {
      sql: 'created_at',
      type: 'time'
    }
  }
});
"""
```

```typescript
// React/Vue/Angular frontend using Cube.js
import cube from '@cubejs-client/core';
import { QueryBuilder } from '@cubejs-client/react';

const cubeApi = cube('CUBE_API_TOKEN', { apiUrl: 'http://localhost:4000/cubejs-api/v1' });

// In DeepSynaps dashboard component
const PipelineChart = () => {
  return (
    <QueryBuilder
      query={{
        measures: ['Deals.totalValue', 'Deals.count'],
        dimensions: ['Deals.stage'],
        order: {
          'Deals.totalValue': 'desc'
        }
      }}
      cubeApi={cubeApi}
      render={({ resultSet }) => {
        if (!resultSet) return 'Loading...';
        
        const data = resultSet.tablePivot();
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data}>
              <XAxis dataKey="Deals.stage" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="Deals.totalValue" fill="#8884d8" />
              <Bar dataKey="Deals.count" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        );
      }}
    />
  );
};
```

**Limitations:**
- Additional infrastructure service to deploy and maintain
- Schema definition requires learning Cube.js DSL
- Pre-aggregations require storage (additional S3/DB space)
- Overkill for simple analytics needs
- Real-time features add complexity
- Security context configuration requires careful JWT handling
- Community support smaller than Metabase/Superset

---

### 2.4 Lightdash (MIT)

| Attribute | Detail |
|-----------|--------|
| **Name** | Lightdash |
| **Language** | TypeScript/React |
| **License** | MIT |
| **GitHub URL** | https://github.com/lightdash/lightdash |
| **Stars** | ~3,500+ |
| **Website** | https://lightdash.com |

**Key Features:**
- dbt-native BI: metrics defined in dbt models
- Automatic discovery of dbt exposures and metrics
- Git-sync: version-controlled analytics
- Self-service exploration for non-technical users
- Dashboards with scheduled delivery
- Row-level security via user attributes
- Slack integration for sharing
- SQL runner for ad-hoc queries
- Semantic layer for metric definitions
- Export to CSV, image, or Google Sheets
- Self-hosted via Docker/Kubernetes

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Lightdash integration (primarily dbt-focused)
# Lightdash reads from your data warehouse directly
# FastAPI serves as the application layer that embeds Lightdash

from fastapi import FastAPI, Depends
from fastapi.responses import HTMLResponse

LIGHTDASH_URL = "http://lightdash:8080"

@app.get("/api/v1/analytics/lightdash/projects")
async def list_lightdash_projects(
    current_user: User = Depends(get_current_user)
):
    """List available Lightdash projects for the user's org"""
    # Lightdash has its own API for project management
    import requests
    
    response = requests.get(
        f"{LIGHTDASH_URL}/api/v1/projects",
        headers={"Authorization": f"ApiKey {LIGHTDASH_API_KEY}"}
    )
    
    projects = response.json().get("results", [])
    # Filter to user's organization
    return {
        "projects": [
            {"uuid": p["projectUuid"], "name": p["name"]}
            for p in projects
            if p.get("organization_id") == current_user.organization_id
        ]
    }

@app.get("/analytics/lightdash/dashboard/{project_uuid}/{dashboard_uuid}")
async def embed_lightdash_dashboard(
    project_uuid: str,
    dashboard_uuid: str,
    current_user: User = Depends(get_current_user)
):
    """
    Generate embeddable Lightdash dashboard URL.
    Lightdash uses signed embed URLs with user attributes.
    """
    import jwt
    
    payload = {
        "user_id": str(current_user.id),
        "organization_id": str(current_user.organization_id),
        "email": current_user.email,
        "role": current_user.role,
        "exp": datetime.utcnow() + timedelta(hours=8)
    }
    
    embed_token = jwt.encode(payload, LIGHTDASH_EMBED_SECRET, algorithm="HS256")
    
    dashboard_url = (
        f"{LIGHTDASH_URL}/projects/{project_uuid}/dashboards/{dashboard_uuid}"
        f"?embed_token={embed_token}"
    )
    
    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html>
    <head><title>Analytics - DeepSynaps</title></head>
    <body style="margin:0;padding:0;">
        <iframe 
            src="{dashboard_url}" 
            style="width:100%;height:100vh;border:none;"
            sandbox="allow-scripts allow-same-origin allow-popups"
        ></iframe>
    </body>
    </html>
    """)

# dbt models for CRM analytics (dbt_project/models/analytics/)
"""
-- models/marts/crm/deals_pipeline.sql
WITH deal_stages AS (
    SELECT
        stage,
        COUNT(*) as deal_count,
        SUM(value) as total_value,
        AVG(value) as avg_value,
        AVG(probability) as avg_probability
    FROM {{ ref('deals') }}
    WHERE created_at >= DATEADD(day, -90, CURRENT_DATE)
    GROUP BY stage
)
SELECT * FROM deal_stages

-- models/marts/crm/contact_engagement.sql
SELECT
    c.id,
    c.first_name || ' ' || c.last_name as full_name,
    c.email,
    c.status,
    COUNT(a.id) as activity_count,
    MAX(a.created_at) as last_activity_date,
    COUNT(d.id) as deal_count,
    SUM(CASE WHEN d.stage = 'closed_won' THEN d.value ELSE 0 END) as lifetime_value
FROM {{ ref('contacts') }} c
LEFT JOIN {{ ref('activities') }} a ON a.contact_id = c.id
LEFT JOIN {{ ref('deals') }} d ON d.contact_id = c.id
GROUP BY c.id, c.first_name, c.last_name, c.email, c.status
"""

# Lightdash metrics configuration (schema.yml)
"""
version: 2

models:
  - name: deals_pipeline
    description: "CRM pipeline analysis"
    columns:
      - name: stage
        description: "Deal stage"
        meta:
          dimension:
            type: string
      - name: total_value
        description: "Total value in stage"
        meta:
          metrics:
            total_pipeline:
              type: sum

  - name: contact_engagement
    description: "Contact engagement metrics"
    meta:
      joins:
        - join: deals_pipeline
          sql_on: ${contact_engagement.id} = ${deals_pipeline.contact_id}
    columns:
      - name: lifetime_value
        meta:
          metrics:
            total_ltv:
              type: sum
            avg_ltv:
              type: average
"""
```

**Limitations:**
- Primarily designed for dbt users; less suitable without dbt
- Smaller community and ecosystem
- Embedding capabilities less mature than Metabase
- Requires separate dbt project setup
- Self-hosted deployment less documented than competitors
- Limited visualization types compared to Superset
- Performance depends on underlying data warehouse speed

---

## Analytics & BI Tools Comparison

| Feature | Metabase | Apache Superset | Cube.js | Lightdash |
|---------|----------|----------------|---------|-----------|
| **License** | AGPL-3.0 | Apache 2.0 | MIT/Apache | MIT |
| **Stars** | 47K+ | 63K+ | 17.5K+ | 3.5K+ |
| **Language** | Clojure/JS | Python/React | Rust/TS | TypeScript |
| **Setup Complexity** | Low | High | Medium | Medium |
| **Query Builder** | Visual + SQL | Visual + SQL | Schema/API | dbt-native |
| **Embedding** | Signed JWT | Guest token | API + JWT | Token-based |
| **Caching** | Built-in | Redis/Celery | Advanced pre-agg | Limited |
| **Real-time** | Limited | Limited | Yes | No |
| **Row-level Security** | Sandboxing | Filter clauses | Security context | User attributes |
| **Export Formats** | CSV/XLSX/JSON | CSV/JSON/XLSX | CSV/JSON/XLSX | CSV/Image |
| **API Access** | REST | REST | REST/GraphQL | REST |
| **Best For** | Self-service BI | Enterprise BI | Embedded analytics | dbt teams |
| **DeepSynaps Fit** | **Excellent** | Good | Good for embed | Moderate |

---

## 3. CRM Systems (Open Source)

### 3.1 SuiteCRM (AGPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | SuiteCRM |
| **Language** | PHP/JavaScript |
| **License** | AGPL-3.0 |
| **GitHub URL** | https://github.com/SuiteCRM/SuiteCRM |
| **Stars** | 5,400+ (core) |
| **Website** | https://suitecrm.com |

**Key Features:**
- Full-featured CRM forked from SugarCRM
- Sales, marketing, and customer service modules
- Workflow automation engine (AOW)
- Advanced reporting with Report Module
- Email campaigns and marketing automation
- Customer portal
- REST API v8
- Module Builder for custom entities
- Dashboard with dashlets
- Document management
- Calendar and activity management
- Role-based security (groups, roles, teams)
- Extension marketplace
- Mobile-responsive theme

**Integration Path with FastAPI + SQLAlchemy:**

SuiteCRM is a monolithic PHP application and cannot be directly embedded. Integration is API-based.

```python
# FastAPI: SuiteCRM API integration layer
from fastapi import FastAPI, HTTPException
import requests
from pydantic import BaseModel
from typing import Optional, List

SUITECRM_URL = "https://suitecrm.example.com"
SUITECRM_CLIENT_ID = "client-id"
SUITECRM_CLIENT_SECRET = "client-secret"

class SuiteCRMAuth:
    def __init__(self):
        self.token = None
        self.refresh_token = None
        self.expires_at = 0
    
    def authenticate(self):
        """OAuth2 client credentials flow"""
        response = requests.post(
            f"{SUITECRM_URL}/Api/access_token",
            data={
                "grant_type": "client_credentials",
                "client_id": SUITECRM_CLIENT_ID,
                "client_secret": SUITECRM_CLIENT_SECRET
            }
        )
        data = response.json()
        self.token = data["access_token"]
        self.refresh_token = data.get("refresh_token")
        self.expires_at = time.time() + data["expires_in"]
    
    def get_token(self):
        if not self.token or time.time() >= self.expires_at - 60:
            self.authenticate()
        return self.token

suite_auth = SuiteCRMAuth()

@app.get("/api/v1/suitecrm/contacts")
async def suitecrm_list_contacts(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None
):
    """
    Proxy SuiteCRM contacts to DeepSynaps unified API.
    Used during migration or when SuiteCRM coexists with DeepSynaps.
    """
    token = suite_auth.get_token()
    
    params = {
        "page[number]": page,
        "page[size]": limit,
        "fields[Contacts]": "first_name,last_name,email,phone,title,account_name"
    }
    
    if search:
        params["filter[first_name][contains]"] = search
    
    response = requests.get(
        f"{SUITECRM_URL}/Api/V8/module/Contacts",
        headers={"Authorization": f"Bearer {token}"},
        params=params
    )
    
    suite_data = response.json()
    
    # Normalize SuiteCRM format to DeepSynaps format
    return {
        "source": "suitecrm",
        "data": [
            {
                "id": item["id"],
                "first_name": item["attributes"].get("first_name"),
                "last_name": item["attributes"].get("last_name"),
                "email": item["attributes"].get("email"),
                "phone": item["attributes"].get("phone"),
                "title": item["attributes"].get("title"),
                "organization": item["attributes"].get("account_name"),
                "source_system": "suitecrm"
            }
            for item in suite_data.get("data", [])
        ],
        "meta": suite_data.get("meta", {})
    }

@app.post("/api/v1/suitecrm/sync")
async def sync_from_suitecrm(direction: str = "import"):
    """
    Sync data between SuiteCRM and DeepSynaps.
    direction: 'import' (SuiteCRM -> DeepSynaps) or 'export' (DeepSynaps -> SuiteCRM)
    """
    if direction == "import":
        # Fetch all contacts from SuiteCRM and import to DeepSynaps
        token = suite_auth.get_token()
        page = 1
        imported = 0
        
        while True:
            response = requests.get(
                f"{SUITECRM_URL}/Api/V8/module/Contacts",
                headers={"Authorization": f"Bearer {token}"},
                params={"page[number]": page, "page[size]": 100}
            )
            
            data = response.json()
            contacts = data.get("data", [])
            
            if not contacts:
                break
            
            for item in contacts:
                attrs = item["attributes"]
                # Upsert into DeepSynaps
                existing = db.query(Contact).filter(
                    Contact.suitecrm_id == item["id"]
                ).first()
                
                if existing:
                    existing.first_name = attrs.get("first_name")
                    existing.last_name = attrs.get("last_name")
                    existing.email = attrs.get("email")
                else:
                    contact = Contact(
                        suitecrm_id=item["id"],
                        first_name=attrs.get("first_name"),
                        last_name=attrs.get("last_name"),
                        email=attrs.get("email"),
                        phone=attrs.get("phone"),
                        status="migrated"
                    )
                    db.add(contact)
                imported += 1
            
            db.commit()
            page += 1
        
        return {"imported": imported, "source": "suitecrm"}
    
    return {"error": "Unsupported direction"}

# SuiteCRM webhook receiver
@app.post("/api/v1/webhooks/suitecrm")
async def suitecrm_webhook(payload: dict):
    """
    Receive SuiteCRM webhooks for real-time sync.
    Configure SuiteCRM AOW (Advanced Open Workflow) to send webhooks on record changes.
    """
    event_type = payload.get("event_type")  # created, updated, deleted
    module = payload.get("module")
    record_id = payload.get("record_id")
    data = payload.get("data", {})
    
    if module == "Contacts":
        if event_type in ("created", "updated"):
            # Upsert contact in DeepSynaps
            pass
        elif event_type == "deleted":
            # Mark as deleted or remove
            pass
    
    return {"processed": True}
```

**Limitations:**
- PHP-based; requires separate LAMP/LEMP stack
- Heavy monolithic architecture
- UI feels dated compared to modern React/Vue apps
- AGPL license complicates commercial SaaS usage
- Extension development requires PHP knowledge
- Performance issues with large datasets
- Mobile experience suboptimal
- Migration to modern stack is complex

---

### 3.2 EspoCRM (AGPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | EspoCRM |
| **Language** | PHP/JavaScript |
| **License** | AGPL-3.0 |
| **GitHub URL** | https://github.com/espocrm/espocrm |
| **Stars** | 2,900+ |
| **Website** | https://www.espocrm.com |

**Key Features:**
- Lightweight, modern CRM platform
- Clean REST API (v1)
- Entity Manager for custom fields and relationships
- BPM workflow engine
- Email integration (IMAP/SMTP)
- Calendar and activity management
- Document management
- Mass email campaigns
- Knowledge base
- Customer portal
- Extension marketplace
- Responsive SPA frontend
- LDAP/Active Directory authentication
- Advanced pack with reporting and workflow

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: EspoCRM API integration
from fastapi import FastAPI, HTTPException
import requests
from pydantic import BaseModel

ESPOCRM_URL = "https://espocrm.example.com"
ESPOCRM_API_KEY = "your-api-key"

class EspoCRMClient:
    def __init__(self):
        self.base_url = ESPOCRM_URL
        self.headers = {
            "X-Api-Key": ESPOCRM_API_KEY,
            "Content-Type": "application/json"
        }
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/api/v1/{endpoint}"
        response = requests.request(method, url, headers=self.headers, **kwargs)
        return response.json()

espoclient = EspoCRMClient()

@app.get("/api/v1/espocrm/contacts")
async def espocrm_list_contacts(
    max_size: int = 20,
    offset: int = 0,
    where: Optional[str] = None,
    search: Optional[str] = None
):
    """
    List contacts from EspoCRM with DeepSynaps normalization.
    """
    params = {
        "maxSize": max_size,
        "offset": offset,
        "select": "firstName,lastName,emailAddress,phoneNumber,title,accountName,status"
    }
    
    if search:
        params["q"] = search
    
    if where:
        params["where"] = where
    
    data = espoclient.request("GET", "Contact", params=params)
    
    return {
        "source": "espocrm",
        "total": data.get("total", 0),
        "data": [
            {
                "id": item["id"],
                "first_name": item.get("firstName"),
                "last_name": item.get("lastName"),
                "email": item.get("emailAddress"),
                "phone": item.get("phoneNumber"),
                "title": item.get("title"),
                "organization": item.get("accountName"),
                "status": item.get("status"),
                "source_system": "espocrm"
            }
            for item in data.get("list", [])
        ]
    }

@app.post("/api/v1/espocrm/contacts")
async def espocrm_create_contact(contact_data: dict):
    """Create contact in EspoCRM from DeepSynaps"""
    # Map DeepSynaps fields to EspoCRM fields
    espocrm_payload = {
        "firstName": contact_data.get("first_name"),
        "lastName": contact_data.get("last_name"),
        "emailAddress": contact_data.get("email"),
        "phoneNumber": contact_data.get("phone"),
        "title": contact_data.get("title"),
        "accountId": contact_data.get("organization_id"),
        "status": contact_data.get("status", "New")
    }
    
    result = espoclient.request("POST", "Contact", json=espocrm_payload)
    return result

# Bidirectional sync service
async def sync_contacts_espocrm_to_deepsynaps():
    """
    Periodic sync job (run via Celery/APScheduler)
    """
    offset = 0
    batch_size = 100
    
    while True:
        data = espoclient.request(
            "GET", "Contact",
            params={"maxSize": batch_size, "offset": offset, "orderBy": "modifiedAt", "order": "desc"}
        )
        
        contacts = data.get("list", [])
        if not contacts:
            break
        
        for contact in contacts:
            # Upsert to DeepSynaps
            existing = db.query(Contact).filter(
                Contact.espocrm_id == contact["id"]
            ).first()
            
            if existing:
                existing.first_name = contact.get("firstName")
                existing.last_name = contact.get("lastName")
                existing.email = contact.get("emailAddress")
                existing.updated_at = datetime.utcnow()
            else:
                new_contact = Contact(
                    espocrm_id=contact["id"],
                    first_name=contact.get("firstName"),
                    last_name=contact.get("lastName"),
                    email=contact.get("emailAddress"),
                    phone=contact.get("phoneNumber"),
                    status=contact.get("status", "new").lower()
                )
                db.add(new_contact)
        
        db.commit()
        offset += batch_size

# EspoCRM webhook handler
@app.post("/api/v1/webhooks/espocrm")
async def espocrm_webhook(payload: dict):
    """
    Handle EspoCRM webhooks for real-time synchronization.
    Configure in EspoCRM: Admin > Webhooks
    """
    event = payload.get("event")  # create, update, delete
    entity_type = payload.get("entityType")
    entity_id = payload.get("entityId")
    data = payload.get("data", {})
    
    if entity_type == "Contact":
        if event in ("create", "update"):
            # Upsert logic
            pass
        elif event == "delete":
            db.query(Contact).filter(Contact.espocrm_id == entity_id).delete()
            db.commit()
    
    return {"status": "ok"}
```

**Limitations:**
- AGPL license (SaaS considerations)
- PHP-based backend
- Smaller extension ecosystem than SuiteCRM
- BPM engine less powerful than dedicated workflow tools
- Email processing can be resource-intensive
- Limited built-in analytics
- Customer portal requires additional setup
- API rate limiting on shared hosting

---

### 3.3 OroCRM (MIT)

| Attribute | Detail |
|-----------|--------|
| **Name** | OroCRM |
| **Language** | PHP/Symfony/JavaScript |
| **License** | MIT (Platform) |
| **GitHub URL** | https://github.com/oroinc/crm |
| **Stars** | 642 (platform-application) |
| **Website** | https://www.orocrm.com |

**Key Features:**
- Built on Symfony PHP framework
- B2B-focused CRM with account management
- Multi-channel customer interaction tracking
- Marketing lists and campaign management
- Reporting and segmentation engine
- Workflow management (OroWorkflowBundle)
- Email synchronization
- Calendar and task management
- Channel management (Magento, WooCommerce, etc.)
- REST API (OroApiBundle)
- Entity configuration UI
- Multi-organization support
- Full-text search (Elasticsearch integration)

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: OroCRM integration via REST API
from fastapi import FastAPI
import requests
from requests.auth import HTTPBasicAuth

OROCRM_URL = "https://orocrm.example.com"
OROCRM_API_KEY = "api-key"
OROCRM_USER = "admin"

class OroCRMClient:
    def __init__(self):
        self.base_url = OROCRM_URL
        self.auth = HTTPBasicAuth(OROCRM_USER, OROCRM_API_KEY)
        self.headers = {
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json"
        }
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/api/{endpoint}"
        response = requests.request(
            method, url, auth=self.auth, headers=self.headers, **kwargs
        )
        return response.json()

oroclient = OroCRMClient()

@app.get("/api/v1/orocrm/accounts")
async def orocrm_list_accounts(limit: int = 20, page: int = 1):
    """List B2B accounts from OroCRM"""
    params = {
        "page[limit]": limit,
        "page[number]": page,
        "fields[accounts]": "name,extend_description,shipping_address,billing_address,organization"
    }
    
    data = oroclient.request("GET", "accounts", params=params)
    
    return {
        "source": "orocrm",
        "data": [
            {
                "id": item["id"],
                "name": item["attributes"].get("name"),
                "description": item["attributes"].get("extend_description"),
                "source_system": "orocrm"
            }
            for item in data.get("data", [])
        ]
    }

@app.get("/api/v1/orocrm/contacts")
async def orocrm_list_contacts(account_id: Optional[str] = None):
    """List contacts, optionally filtered by account"""
    filter_params = {}
    if account_id:
        filter_params["filter[accounts]"] = account_id
    
    data = oroclient.request("GET", "contacts", params=filter_params)
    return data
```

**Limitations:**
- Smaller community (642 stars)
- Complex Symfony-based architecture
- Heavy resource requirements
- Steep learning curve for customization
- Limited modern UI/UX
- Primarily B2B focused; may not suit all CRM needs
- Integration documentation sparse

---

### 3.4 Odoo CRM (LGPL-3.0 / Proprietary)

| Attribute | Detail |
|-----------|--------|
| **Name** | Odoo CRM |
| **Language** | Python/JavaScript/XML |
| **License** | LGPL-3.0 (Community) / Proprietary (Enterprise) |
| **GitHub URL** | https://github.com/odoo/odoo |
| **Stars** | 41,500+ |
| **Website** | https://www.odoo.com |

**Key Features:**
- Modular ERP with CRM module
- Lead management and scoring
- Opportunity pipeline with drag-and-drop
- Activity logging and scheduling
- Email integration and templates
- VoIP integration
- Reporting and dashboards
- Marketing automation (Enterprise)
- Website integration (Enterprise)
- Mobile app (iOS/Android)
- REST API (Odoo RPC / REST frameworks)
- Multi-company support
- Workflow automation
- 30,000+ apps in marketplace

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Odoo integration via XML-RPC and REST
from fastapi import FastAPI
import xmlrpc.client
from pydantic import BaseModel

ODOO_URL = "https://odoo.example.com"
ODOO_DB = "deepsynaps"
ODOO_USER = "api@deepsynaps.io"
ODOO_PASSWORD = "api-password"

class OdooClient:
    def __init__(self):
        self.url = ODOO_URL
        self.db = ODOO_DB
        self.common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        self.models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")
        self.uid = self.common.authenticate(self.db, ODOO_USER, ODOO_PASSWORD, {})
    
    def execute(self, model: str, method: str, *args, **kwargs):
        return self.models.execute_kw(
            self.db, self.uid, ODOO_PASSWORD,
            model, method, args, kwargs
        )

odooclient = OdooClient()

@app.get("/api/v1/odoo/leads")
async def odoo_list_leads(
    limit: int = 50,
    offset: int = 0,
    stage: Optional[str] = None,
    user_id: Optional[int] = None
):
    """List CRM leads/opportunities from Odoo"""
    domain = []
    if stage:
        domain.append(("stage_id.name", "=", stage))
    if user_id:
        domain.append(("user_id", "=", user_id))
    
    leads = odooclient.execute(
        "crm.lead", "search_read",
        domain,
        {"fields": ["name", "email_from", "phone", "stage_id", "user_id",
                    "expected_revenue", "probability", "create_date"],
         "limit": limit, "offset": offset,
         "order": "create_date desc"}
    )
    
    return {
        "source": "odoo",
        "count": len(leads),
        "data": [
            {
                "id": lead["id"],
                "title": lead.get("name"),
                "email": lead.get("email_from"),
                "phone": lead.get("phone"),
                "stage": lead.get("stage_id", [None, None])[1],
                "owner": lead.get("user_id", [None, None])[1],
                "expected_revenue": lead.get("expected_revenue"),
                "probability": lead.get("probability"),
                "created_at": lead.get("create_date")
            }
            for lead in leads
        ]
    }

@app.post("/api/v1/odoo/leads")
async def odoo_create_lead(lead_data: dict):
    """Create a lead in Odoo CRM from DeepSynaps"""
    lead_id = odooclient.execute("crm.lead", "create", [{
        "name": lead_data.get("title"),
        "email_from": lead_data.get("email"),
        "phone": lead_data.get("phone"),
        "expected_revenue": lead_data.get("value", 0),
        "probability": lead_data.get("probability", 0),
        "type": "opportunity" if lead_data.get("is_opportunity") else "lead"
    }])
    
    return {"id": lead_id, "source": "odoo", "created": True}

# Alternative: Using Odoo REST API addon (like odoo-rest-api or fastapi-odoo)
@app.get("/api/v1/odoo/partners")
async def odoo_list_partners(search: Optional[str] = None):
    """List res.partner (contacts/customers) from Odoo"""
    domain = [("customer_rank", ">", 0)]
    if search:
        domain.extend(["|", "|",
            ("name", "ilike", search),
            ("email", "ilike", search),
            ("phone", "ilike", search)
        ])
    
    partners = odooclient.execute(
        "res.partner", "search_read",
        domain,
        {"fields": ["name", "email", "phone", "mobile", "street", "city",
                    "country_id", "company_name", "customer_rank"],
         "limit": 50}
    )
    
    return {"source": "odoo", "data": partners}
```

**Limitations:**
- Monolithic architecture; CRM is one module among many
- Complex deployment and upgrade process
- Enterprise features require paid subscription
- Python 3.10+ required for latest versions
- Customization requires Odoo framework knowledge
- Heavy resource footprint for full ERP
- UI can feel complex for simple CRM use cases
- Database schema heavily normalized; direct queries complex

---

### 3.5 Corteza (Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Corteza |
| **Language** | Go/Vue.js |
| **License** | Apache 2.0 |
| **GitHub URL** | https://github.com/cortezaproject/corteza |
| **Stars** | ~1,200+ (across org) |
| **Website** | https://cortezaproject.org |

**Key Features:**
- Low-code platform for building business applications
- Module Builder for custom CRM entities
- Workflow automation engine (Corredor)
- Page Builder for custom UI
- Role-based access control
- REST API and CLI
- Data privacy-focused (GDPR compliance tools)
- Federation capabilities (cross-instance data sharing)
- Messaging system
- Record reconciliation
- Template system for documents
- Chart and metric blocks
- Import/export (CSV, JSON)

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Corteza integration via REST API
from fastapi import FastAPI
import requests

CORTEZA_URL = "https://corteza.example.com"
CORTEZA_TOKEN = "jwt-auth-token"

class CortezaClient:
    def __init__(self):
        self.base_url = CORTEZA_URL
        self.headers = {
            "Authorization": f"Bearer {CORTEZA_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/api/{endpoint}"
        return requests.request(method, url, headers=self.headers, **kwargs).json()

corteza = CortezaClient()

@app.get("/api/v1/corteza/modules/{namespace}/records/{module}")
async def corteza_list_records(
    namespace: str,
    module: str,
    limit: int = 50,
    page: int = 1,
    filter: Optional[str] = None
):
    """List records from a Corteza module (custom CRM entity)"""
    params = {"limit": limit, "pageCursor": page}
    if filter:
        params["filter"] = filter
    
    data = corteza.request(
        "GET",
        f"compose/namespace/{namespace}/module/{module}/record/",
        params=params
    )
    
    return {
        "source": "corteza",
        "namespace": namespace,
        "module": module,
        "data": data.get("response", {}).get("set", [])
    }

@app.post("/api/v1/corteza/modules/{namespace}/records/{module}")
async def corteza_create_record(
    namespace: str,
    module: str,
    record_data: dict
):
    """Create record in Corteza module"""
    payload = {
        "values": [
            {"name": key, "value": value}
            for key, value in record_data.items()
        ]
    }
    
    result = corteza.request(
        "POST",
        f"compose/namespace/{namespace}/module/{module}/record/",
        json=payload
    )
    
    return result
```

**Limitations:**
- Smaller community and ecosystem
- Documentation gaps for advanced features
- Workflow engine (Corredor) can be complex
- Performance concerns with large record sets
- Federation features are experimental
- UI customization limited compared to custom development
- Go backend may require Go knowledge for extensions

---

## CRM Systems Comparison

| Feature | SuiteCRM | EspoCRM | OroCRM | Odoo CRM | Corteza |
|---------|----------|---------|--------|----------|---------|
| **License** | AGPL-3.0 | AGPL-3.0 | MIT | LGPL-3.0 | Apache 2.0 |
| **Stars** | 5.4K+ | 2.9K+ | 642 | 41.5K+ | 1.2K+ |
| **Language** | PHP | PHP | PHP/Symfony | Python/JS | Go/Vue |
| **Architecture** | Monolithic | Monolithic | Symfony | Modular ERP | Low-code |
| **API** | REST v8 | REST v1 | JSON API | XML-RPC/REST | REST |
| **Workflow** | AOW | BPM | OroWorkflow | Studio | Corredor |
| **Reporting** | Built-in | Advanced Pack | Built-in | Built-in | Basic |
| **Email** | Full | Full | Sync | Full | Messaging |
| **Extensibility** | Good | Good | Good | Excellent | Moderate |
| **Modern UI** | Fair | Good | Fair | Good | Good |
| **Mobile** | Responsive | Responsive | Limited | App | Responsive |
| **Best For** | Full CRM | Lightweight | B2B | ERP+CRM | Custom apps |
| **DeepSynaps Fit** | Reference | **Architecture ref** | Low | Integration | Moderate |

---

## 4. Support/Ticketing

### 4.1 Zammad (AGPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Zammad |
| **Language** | Ruby/JavaScript |
| **License** | AGPL-3.0 |
| **GitHub URL** | https://github.com/zammad/zammad |
| **Stars** | 5,600+ |
| **Website** | https://zammad.org |

**Key Features:**
- Multi-channel support: email, web, chat, phone, SMS, Twitter, Facebook, Telegram
- Ticket management with customizable states and priorities
- Auto-assignment and escalation
- Knowledge base (internal and customer-facing)
- Time tracking on tickets
- Customer portal with SSO
- Reporting and analytics
- REST API and GraphQL API
- Elasticsearch integration for full-text search
- LDAP/Active Directory authentication
- Two-factor authentication
- Mobile-responsive interface
- Chat widget for websites
- Macros and triggers for automation
- SLA management
- Omnichannel agent UI

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Zammad integration layer
from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy.orm import Session
import requests
from pydantic import BaseModel
from datetime import datetime

ZAMMAD_URL = "https://zammad.example.com"
ZAMMAD_API_TOKEN = "your-zammad-token"
ZAMMAD_WEBHOOK_SECRET = "webhook-secret"

class ZammadClient:
    def __init__(self):
        self.base_url = ZAMMAD_URL
        self.headers = {
            "Authorization": f"Token token={ZAMMAD_API_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/api/v1/{endpoint}"
        response = requests.request(method, url, headers=self.headers, **kwargs)
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

zammad = ZammadClient()

# ---- DeepSynaps -> Zammad: Create support tickets ----

class TicketCreateRequest(BaseModel):
    title: str
    customer_email: str
    body: str
    priority: str = "2 normal"  # 1 low, 2 normal, 3 high
    group: str = "Support"
    tags: list = []
    custom_fields: dict = {}
    deepsynaps_contact_id: int = None
    deepsynaps_deal_id: int = None

@app.post("/api/v1/support/tickets")
async def create_ticket(
    request: TicketCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a support ticket in Zammad linked to DeepSynaps contact/deal.
    """
    # Ensure customer exists in Zammad
    customer = zammad.request("GET", "users/search", params={"query": request.customer_email, "limit": 1})
    
    if not customer:
        # Create customer in Zammad
        customer_result = zammad.request("POST", "users", json={
            "firstname": request.customer_email.split("@")[0],
            "email": request.customer_email,
            "roles": ["Customer"],
            "note": f"DeepSynaps Contact ID: {request.deepsynaps_contact_id}"
        })
        customer_id = customer_result["id"]
    else:
        customer_id = customer[0]["id"]
    
    # Create ticket
    ticket_data = {
        "title": request.title,
        "group": request.group,
        "customer_id": customer_id,
        "priority": request.priority,
        "article": {
            "subject": request.title,
            "body": request.body,
            "type": "note",
            "internal": False
        },
        "tags": request.tags + ["deepsynaps"],
    }
    
    # Add custom DeepSynaps link fields
    if request.custom_fields:
        ticket_data.update(request.custom_fields)
    
    result = zammad.request("POST", "tickets", json=ticket_data)
    
    # Store mapping in DeepSynaps
    ticket_mapping = SupportTicketMapping(
        deepsynaps_entity_type="contact" if request.deepsynaps_contact_id else "deal",
        deepsynaps_entity_id=request.deepsynaps_contact_id or request.deepsynaps_deal_id,
        zammad_ticket_id=result["id"],
        zammad_ticket_number=result["number"],
        status="open",
        created_by=current_user.id
    )
    db.add(ticket_mapping)
    db.commit()
    
    return {
        "ticket_id": result["id"],
        "ticket_number": result["number"],
        "title": result["title"],
        "state": result.get("state", "new"),
        "zammad_url": f"{ZAMMAD_URL}/#ticket/zoom/{result['id']}"
    }

@app.get("/api/v1/support/tickets")
async def list_tickets(
    state: str = None,  # new, open, closed, merged
    customer_email: str = None,
    page: int = 1,
    per_page: int = 25,
    current_user: User = Depends(get_current_user)
):
    """List support tickets from Zammad with DeepSynaps context"""
    params = {
        "page": page,
        "per_page": per_page,
        "sort_by": "created_at",
        "order": "desc"
    }
    
    filters = []
    if state:
        filters.append(f"state:{state}")
    if customer_email:
        filters.append(f"customer.email:{customer_email}")
    filters.append("tag:deepsynaps")
    
    if filters:
        params["query"] = " AND ".join(filters)
    
    result = zammad.request("GET", "tickets/search", params=params)
    
    # Enrich with DeepSynaps context
    tickets = []
    for ticket in result.get("assets", {}).get("Ticket", {}).values():
        mapping = db.query(SupportTicketMapping).filter(
            SupportTicketMapping.zammad_ticket_id == ticket["id"]
        ).first()
        
        tickets.append({
            "id": ticket["id"],
            "number": ticket["number"],
            "title": ticket["title"],
            "state": ticket["state"],
            "priority": ticket["priority"],
            "created_at": ticket["created_at"],
            "updated_at": ticket["updated_at"],
            "deepsynaps_link": {
                "entity_type": mapping.deepsynaps_entity_type if mapping else None,
                "entity_id": mapping.deepsynaps_entity_id if mapping else None
            } if mapping else None,
            "zammad_url": f"{ZAMMAD_URL}/#ticket/zoom/{ticket['id']}"
        })
    
    return {"tickets": tickets, "total": result.get("total_count", 0)}

@app.get("/api/v1/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: int):
    """Get detailed ticket with articles from Zammad"""
    ticket = zammad.request("GET", f"tickets/{ticket_id}")
    articles = zammad.request("GET", f"ticket_articles/by_ticket/{ticket_id}")
    
    return {
        "ticket": ticket,
        "articles": articles,
        "zammad_url": f"{ZAMMAD_URL}/#ticket/zoom/{ticket_id}"
    }

@app.post("/api/v1/support/tickets/{ticket_id}/reply")
async def reply_to_ticket(ticket_id: int, body: str, internal: bool = False):
    """Add reply/article to a ticket"""
    result = zammad.request("POST", "ticket_articles", json={
        "ticket_id": ticket_id,
        "body": body,
        "type": ("note" if internal else "email"),
        "internal": internal,
        "sender": "Agent"
    })
    return result

# ---- Zammad -> DeepSynaps: Webhook handler ----

@app.post("/api/v1/webhooks/zammad")
async def zammad_webhook(payload: dict):
    """
    Receive Zammad webhooks for ticket state changes.
    Configure in Zammad: Admin > Webhooks
    Events: ticket.created, ticket.updated, ticket.escalation
    """
    event = payload.get("event")
    ticket = payload.get("ticket", {})
    article = payload.get("article", {})
    
    ticket_id = ticket.get("id")
    state = ticket.get("state")
    
    # Update mapping in DeepSynaps
    mapping = db.query(SupportTicketMapping).filter(
        SupportTicketMapping.zammad_ticket_id == ticket_id
    ).first()
    
    if mapping:
        mapping.status = state.lower()
        mapping.updated_at = datetime.utcnow()
        db.commit()
    
    # Log activity in DeepSynaps
    activity = Activity(
        type="support_ticket_update",
        description=f"Ticket #{ticket.get('number')} changed to {state}",
        related_entity_type=mapping.deepsynaps_entity_type if mapping else "unknown",
        related_entity_id=mapping.deepsynaps_entity_id if mapping else None,
        metadata={
            "zammad_ticket_id": ticket_id,
            "zammad_ticket_number": ticket.get("number"),
            "event": event,
            "article_preview": article.get("body", "")[:200] if article else None
        }
    )
    db.add(activity)
    db.commit()
    
    # Trigger notifications if needed
    if state in ("closed", "escalated"):
        await notification_service.notify(
            entity_type=mapping.deepsynaps_entity_type if mapping else "support",
            entity_id=mapping.deepsynaps_entity_id if mapping else ticket_id,
            message=f"Support ticket #{ticket.get('number')} is now {state}",
            priority="high" if state == "escalated" else "normal"
        )
    
    return {"status": "processed"}

# ---- Knowledge Base integration ----

@app.get("/api/v1/support/knowledge-base")
async def list_kb_articles(
    category: str = None,
    search: str = None,
    locale: str = "en-us"
):
    """List knowledge base articles from Zammad"""
    params = {"locale": locale}
    if category:
        params["category"] = category
    if search:
        params["query"] = search
    
    result = zammad.request("GET", "knowledge_bases/search", params=params)
    return result
```

**Limitations:**
- AGPL license (SaaS considerations)
- Ruby on Rails backend requires separate infrastructure
- Elasticsearch dependency for search
- Complex upgrade process
- Limited customization of customer portal without forking
- Can be resource-intensive with many channels
- No built-in AI/automation features (requires extensions)

---

### 4.2 UVDesk (OSL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | UVDesk |
| **Language** | PHP/Symfony |
| **License** | Open Software License 3.0 |
| **GitHub URL** | https://github.com/uvdesk/community-skeleton |
| **Stars** | 19,000+ |
| **Website** | https://www.uvdesk.com |

**Key Features:**
- Symfony-based helpdesk system
- Email-to-ticket conversion
- Knowledge base system
- Custom ticket types, statuses, and priorities
- Automated workflows (SwiftMailer events)
- Agent collision detection
- Ticket tags and labels
- Customer satisfaction surveys
- Multi-brand support
- REST API
- Mailbox integration (IMAP/POP3)
- Form builder for ticket submission
- File attachments
- Agent performance reports
- Role-based access control
- eCommerce integrations (Shopify, Magento, WooCommerce)

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: UVDesk integration
from fastapi import FastAPI, HTTPException
import requests
from requests.auth import HTTPBasicAuth

UVDESK_URL = "https://uvdesk.example.com"
UVDESK_API_KEY = "api-key"
UVDESK_EMAIL = "admin@deepsynaps.io"

class UVDeskClient:
    def __init__(self):
        self.base_url = UVDESK_URL
        self.auth = HTTPBasicAuth(UVDESK_EMAIL, UVDESK_API_KEY)
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/api/v1/{endpoint}"
        response = requests.request(method, url, auth=self.auth, **kwargs)
        return response.json()

uvdesk = UVDeskClient()

@app.get("/api/v1/support/uvdesk/tickets")
async def uvdesk_list_tickets(
    status: str = None,  # 1=open, 2=closed, 3=pending, 4=resolved
    page: int = 1,
    limit: int = 10
):
    """List tickets from UVDesk"""
    params = {"page": page, "limit": limit}
    if status:
        params["status"] = status
    
    result = uvdesk.request("GET", "tickets", params=params)
    return result

@app.post("/api/v1/support/uvdesk/tickets")
async def uvdesk_create_ticket(ticket_data: dict):
    """Create ticket in UVDesk"""
    payload = {
        "type": ticket_data.get("type", "support"),
        "subject": ticket_data["subject"],
        "message": ticket_data["message"],
        "customerEmail": ticket_data["customer_email"],
        "priority": ticket_data.get("priority", 1),
        "mailbox": ticket_data.get("mailbox", "support")
    }
    
    result = uvdesk.request("POST", "tickets", json=payload)
    return result

@app.get("/api/v1/support/uvdesk/tickets/{ticket_id}/threads")
async def uvdesk_ticket_threads(ticket_id: str):
    """Get ticket conversation threads"""
    result = uvdesk.request("GET", f"ticket/{ticket_id}/threads")
    return result
```

**Limitations:**
- OSL license less common than MIT/Apache
- PHP-based; requires separate hosting
- Limited native API documentation
- Smaller extension ecosystem
- Knowledge base less feature-rich than competitors
- Limited automation capabilities
- Mobile experience basic
- Self-hosted only (no cloud option)

---

### 4.3 FreeScout (AGPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | FreeScout |
| **Language** | PHP/Laravel |
| **License** | AGPL-3.0 |
| **GitHub URL** | https://github.com/freescout-helpdesk/freescout |
| **Stars** | 4,000+ |
| **Website** | https://freescout.net |

**Key Features:**
- Lightweight shared inbox
- Email-to-ticket conversion
- Multi-mailbox support
- Collision detection
- Tags and custom folders
- Knowledge base module
- Customer portal module
- API access (via module)
- Workflow automation module
- Time tracking module
- Satisfaction ratings
- Custom fields
- End-to-end encryption module
- LDAP integration
- Slack notifications
- Telegram integration
- Module marketplace

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: FreeScout integration
from fastapi import FastAPI
import requests

FREESCOUT_URL = "https://freescout.example.com"
FREESCOUT_API_KEY = "api-key"

class FreeScoutClient:
    def __init__(self):
        self.base_url = FREESCOUT_URL
        self.headers = {
            "X-FreeScout-API-Key": FREESCOUT_API_KEY
        }
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/api/{endpoint}"
        return requests.request(method, url, headers=self.headers, **kwargs).json()

freescout = FreeScoutClient()

@app.get("/api/v1/support/freescout/conversations")
async def freescout_list_conversations(
    mailbox_id: int = None,
    status: str = "active",  # active, closed, spam
    page: int = 1
):
    """List conversations from FreeScout"""
    params = {"page": page}
    if mailbox_id:
        params["mailboxId"] = mailbox_id
    if status:
        params["status"] = status
    
    result = freescout.request("GET", "conversations", params=params)
    return result

@app.post("/api/v1/support/freescout/conversations")
async def freescout_create_conversation(data: dict):
    """Create conversation in FreeScout"""
    payload = {
        "type": "email",
        "mailboxId": data["mailbox_id"],
        "subject": data["subject"],
        "body": data["body"],
        "customer": {
            "email": data["customer_email"],
            "firstName": data.get("customer_first_name"),
            "lastName": data.get("customer_last_name")
        }
    }
    
    result = freescout.request("POST", "conversations", json=payload)
    return result
```

**Limitations:**
- AGPL license
- PHP/Laravel based
- Many features require paid modules
- API is module-based (not core)
- Limited reporting capabilities
- No built-in chat
- Less suitable for large teams without modules
- Support community smaller than Zammad

---

### 4.4 osTicket (GPL-2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | osTicket |
| **Language** | PHP |
| **License** | GPL-2.0 |
| **GitHub URL** | https://github.com/osTicket/osTicket |
| **Stars** | 2,800+ |
| **Website** | https://osticket.com |

**Key Features:**
- Widely-used open-source ticket system
- Email piping and fetching (POP3/IMAP)
- Custom ticket forms and fields
- SLA management
- Help topics and departments
- Agent collision avoidance
- Ticket filters and auto-assignment
- Canned responses
- Customer portal
- Knowledge base FAQ
- Dashboard statistics
- Plugin architecture
- REST API (via plugin)
- LDAP/Active Directory authentication
- Multi-language support

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: osTicket integration
from fastapi import FastAPI
import requests

OSTICKET_URL = "https://osticket.example.com"
OSTICKET_API_KEY = "api-key"

@app.post("/api/v1/support/osticket/tickets")
async def osticket_create_ticket(ticket_data: dict):
    """Create ticket via osTicket API"""
    payload = {
        "name": ticket_data["customer_name"],
        "email": ticket_data["customer_email"],
        "subject": ticket_data["subject"],
        "message": ticket_data["body"],
        "topicId": ticket_data.get("topic_id", 1),
        "priorityId": ticket_data.get("priority_id", 2)
    }
    
    response = requests.post(
        f"{OSTICKET_URL}/api/tickets.json",
        json=payload,
        headers={"X-API-Key": OSTICKET_API_KEY}
    )
    
    return {
        "ticket_id": response.json().get("ticket_id"),
        "ticket_number": response.json().get("ticket_number"),
        "status": "created"
    }

# osTicket doesn't have a built-in REST API for listing
# Requires the REST API plugin or direct database access
@app.get("/api/v1/support/osticket/tickets")
async def osticket_list_tickets(db: Session = Depends(get_db)):
    """
    Direct database query to osTicket for listing.
    Requires read-only database user access to osTicket DB.
    """
    # Query osTicket database directly
    osticket_db = get_osticket_db_session()
    
    result = osticket_db.execute(text("""
        SELECT 
            t.ticket_id,
            t.number,
            t.subject,
            t.status_id,
            s.name as status_name,
            t.priority_id,
            p.priority_desc,
            t.created,
            u.name as customer_name,
            u.email as customer_email,
            d.name as department
        FROM ost_ticket t
        JOIN ost_ticket_status s ON t.status_id = s.id
        JOIN ost_ticket_priority p ON t.priority_id = p.priority_id
        JOIN ost_user u ON t.user_id = u.id
        LEFT JOIN ost_department d ON t.dept_id = d.dept_id
        ORDER BY t.created DESC
        LIMIT 100
    """)).fetchall()
    
    return {
        "source": "osticket",
        "tickets": [
            {
                "ticket_id": row.ticket_id,
                "ticket_number": row.number,
                "subject": row.subject,
                "status": row.status_name,
                "priority": row.priority_desc,
                "customer": {"name": row.customer_name, "email": row.customer_email},
                "department": row.department,
                "created": str(row.created)
            }
            for row in result
        ]
    }
```

**Limitations:**
- GPL-2.0 license (strong copyleft)
- Dated UI/UX
- REST API requires plugin
- Limited modern integrations
- No real-time features
- Mobile experience poor
- Plugin ecosystem limited
- Development pace slow
- Not suitable for multi-channel support

---

## Support/Ticketing Tools Comparison

| Feature | Zammad | UVDesk | FreeScout | osTicket |
|---------|--------|--------|-----------|----------|
| **License** | AGPL-3.0 | OSL-3.0 | AGPL-3.0 | GPL-2.0 |
| **Stars** | 5.6K+ | 19K+ | 4K+ | 2.8K+ |
| **Language** | Ruby/JS | PHP/Symfony | PHP/Laravel | PHP |
| **Multi-channel** | Excellent | Good | Email-focused | Email |
| **API** | REST+GraphQL | REST | REST (module) | REST (plugin) |
| **Knowledge Base** | Built-in | Built-in | Module | Basic |
| **SLA Management** | Yes | Basic | Module | Yes |
| **Time Tracking** | Built-in | Basic | Module | Plugin |
| **Automation** | Triggers/Macros | Workflows | Module | Filters |
| **Customer Portal** | Yes | Yes | Module | Yes |
| **Search** | Elasticsearch | Database | Database | Database |
| **Best For** | Omnichannel | eCommerce | Shared inbox | Basic helpdesk |
| **DeepSynaps Fit** | **Excellent** | Good | Moderate | Low |

---

## 5. Monitoring & Observability

### 5.1 Prometheus (Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Prometheus |
| **Language** | Go |
| **License** | Apache 2.0 |
| **GitHub URL** | https://github.com/prometheus/prometheus |
| **Stars** | 58,000+ |
| **Website** | https://prometheus.io |

**Key Features:**
- Time-series metrics collection and storage
- Pull-based scraping model (HTTP endpoints)
- PromQL: powerful query language for metrics
- Alertmanager for routing and managing alerts
- Service discovery (Kubernetes, Consul, EC2, file-based)
- Recording rules for pre-computed queries
- Federation for hierarchical monitoring
- Exporters for 100+ third-party systems
- Histogram and summary metric types
- Pushgateway for short-lived jobs
- Remote storage integrations
- TLS and authentication support

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Prometheus metrics instrumentation
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from prometheus_client import (
    Counter, Histogram, Gauge, Info,
    generate_latest, CONTENT_TYPE_LATEST,
    CollectorRegistry
)
import time

# Create dedicated registry for DeepSynaps metrics
REGISTRY = CollectorRegistry()

# Define CRM-specific metrics
# HTTP request metrics
http_requests_total = Counter(
    "deepsynaps_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
    registry=REGISTRY
)

http_request_duration_seconds = Histogram(
    "deepsynaps_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registry=REGISTRY
)

# Business metrics
crm_contacts_total = Gauge(
    "deepsynaps_crm_contacts_total",
    "Total contacts in CRM",
    ["status", "organization_id"],
    registry=REGISTRY
)

crm_deals_total = Gauge(
    "deepsynaps_crm_deals_total",
    "Total deals in CRM",
    ["stage", "organization_id"],
    registry=REGISTRY
)

crm_pipeline_value = Gauge(
    "deepsynaps_crm_pipeline_value",
    "Total pipeline value",
    ["stage", "currency", "organization_id"],
    registry=REGISTRY
)

crm_activities_total = Counter(
    "deepsynaps_crm_activities_total",
    "Total CRM activities performed",
    ["activity_type", "organization_id"],
    registry=REGISTRY
)

crm_ticket_resolution_time = Histogram(
    "deepsynaps_crm_ticket_resolution_seconds",
    "Time to resolve support tickets",
    ["priority", "category"],
    buckets=[300, 900, 1800, 3600, 7200, 14400, 28800, 86400],
    registry=REGISTRY
)

# System info
deployment_info = Info(
    "deepsynaps_deployment",
    "DeepSynaps deployment information",
    registry=REGISTRY
)

# Initialize deployment info
deployment_info.info({
    "version": "1.0.0",
    "environment": "production",
    "region": "us-east-1"
})

# FastAPI middleware for metrics collection
@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    route = request.url.path
    method = request.method
    status_code = str(response.status_code)
    
    # Record metrics
    http_requests_total.labels(
        method=method,
        endpoint=route,
        status_code=status_code
    ).inc()
    
    http_request_duration_seconds.labels(
        method=method,
        endpoint=route
    ).observe(duration)
    
    return response

# Prometheus metrics endpoint
@app.get("/metrics")
async def metrics():
    """
    Prometheus scrape endpoint.
    Configure Prometheus to scrape: http://fastapi:8000/metrics
    """
    return PlainTextResponse(
        content=generate_latest(REGISTRY),
        media_type=CONTENT_TYPE_LATEST
    )

# Background metrics updater (runs periodically via APScheduler/Celery)
async def update_business_metrics(db: Session):
    """Update CRM business metrics periodically"""
    
    # Contact counts by status
    contact_counts = db.execute(text("""
        SELECT status, organization_id, COUNT(*) as count
        FROM contacts
        GROUP BY status, organization_id
    """)).fetchall()
    
    for row in contact_counts:
        crm_contacts_total.labels(
            status=row.status,
            organization_id=str(row.organization_id)
        ).set(row.count)
    
    # Deal counts by stage
    deal_counts = db.execute(text("""
        SELECT stage, organization_id, COUNT(*) as count, SUM(value) as total_value
        FROM deals
        GROUP BY stage, organization_id
    """)).fetchall()
    
    for row in deal_counts:
        crm_deals_total.labels(
            stage=row.stage,
            organization_id=str(row.organization_id)
        ).set(row.count)
        
        crm_pipeline_value.labels(
            stage=row.stage,
            currency="USD",
            organization_id=str(row.organization_id)
        ).set(float(row.total_value or 0))

# Custom business events
@app.post("/api/v1/crm/activities")
async def log_activity(activity: ActivityCreate, db: Session = Depends(get_db)):
    """Log CRM activity and record metric"""
    
    # Create activity in database
    db_activity = Activity(**activity.dict())
    db.add(db_activity)
    db.commit()
    
    # Record Prometheus metric
    crm_activities_total.labels(
        activity_type=activity.type,
        organization_id=str(activity.organization_id)
    ).inc()
    
    return db_activity

@app.post("/api/v1/support/tickets/{ticket_id}/resolve")
async def resolve_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Resolve ticket and record resolution time metric"""
    
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404)
    
    # Calculate resolution time
    resolution_time = (datetime.utcnow() - ticket.created_at).total_seconds()
    
    ticket.status = "resolved"
    ticket.resolved_at = datetime.utcnow()
    db.commit()
    
    # Record metric
    crm_ticket_resolution_time.labels(
        priority=ticket.priority,
        category=ticket.category or "general"
    ).observe(resolution_time)
    
    return {"ticket_id": ticket_id, "resolution_time_seconds": resolution_time}
```

**Prometheus Configuration:**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'deepsynaps-fastapi'
    scrape_interval: 15s
    static_configs:
      - targets: ['fastapi:8000']
    metrics_path: '/metrics'
    
  - job_name: 'deepsynaps-postgresql'
    scrape_interval: 30s
    static_configs:
      - targets: ['postgres-exporter:9187']
    
  - job_name: 'deepsynaps-redis'
    scrape_interval: 30s
    static_configs:
      - targets: ['redis-exporter:9121']
    
  - job_name: 'deepsynaps-celery'
    scrape_interval: 30s
    static_configs:
      - targets: ['celery-exporter:9808']

# alert_rules.yml
groups:
  - name: deepsynaps_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(deepsynaps_http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          
      - alert: SlowAPIRequests
        expr: histogram_quantile(0.95, rate(deepsynaps_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API p95 latency > 2 seconds"
          
      - alert: LowContactCreationRate
        expr: rate(deepsynaps_crm_activities_total{activity_type="contact_created"}[1h]) == 0
        for: 24h
        labels:
          severity: info
        annotations:
          summary: "No contacts created in 24 hours"
```

**Limitations:**
- Pull-based model requires endpoint accessibility
- Not designed for long-term storage (typically 15 days default)
- PromQL has learning curve
- High cardinality labels can cause memory issues
- No built-in user management or multi-tenancy
- Alertmanager configuration is YAML-based
- Federation can be complex to set up

---

### 5.2 Grafana (AGPL-3.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Grafana |
| **Language** | Go/TypeScript |
| **License** | AGPL-3.0 |
| **GitHub URL** | https://github.com/grafana/grafana |
| **Stars** | 68,700+ |
| **Website** | https://grafana.com |

**Key Features:**
- Open observability platform with visualization dashboards
- 100+ data source plugins (Prometheus, PostgreSQL, InfluxDB, etc.)
- Customizable dashboard panels with many visualization types
- Alerting with multi-channel notifications (email, Slack, PagerDuty, etc.)
- Template variables for dynamic dashboards
- Annotations for marking events
- Dashboard sharing and export/import (JSON)
- User management with organizations and teams
- Plugin ecosystem for extensions
- Grafana Loki for log aggregation
- Grafana Tempo for distributed tracing
- Grafana OnCall for incident response
- Machine learning for anomaly detection (Grafana Cloud)
- Public dashboards
- Reporting (PDF/PNG scheduling)
- SSO integration (OAuth, SAML, LDAP)

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Grafana integration
from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
import requests
import jwt
from datetime import datetime, timedelta

GRAFANA_URL = "http://grafana:3000"
GRAFANA_API_KEY = "your-service-account-token"
GRAFANA_SECRET = "embedding-secret"

class GrafanaClient:
    def __init__(self):
        self.base_url = GRAFANA_URL
        self.headers = {
            "Authorization": f"Bearer {GRAFANA_API_KEY}",
            "Content-Type": "application/json"
        }
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/api/{endpoint}"
        response = requests.request(method, url, headers=self.headers, **kwargs)
        return response

grafanaclient = GrafanaClient()

@app.post("/api/v1/monitoring/grafana/dashboards")
async def create_crm_dashboard(
    org_id: int,
    dashboard_title: str = "DeepSynaps CRM Dashboard"
):
    """
    Programmatically create Grafana dashboard for an organization.
    """
    dashboard_json = {
        "dashboard": {
            "id": None,
            "uid": f"deepsynaps-crm-{org_id}",
            "title": dashboard_title,
            "timezone": "browser",
            "schemaVersion": 36,
            "refresh": "30s",
            "panels": [
                # Panel 1: Contact growth over time
                {
                    "id": 1,
                    "title": "Contact Growth",
                    "type": "timeseries",
                    "targets": [{
                        "expr": f'deepsynaps_crm_contacts_total{{organization_id="{org_id}"}}',
                        "legendFormat": "{{status}}"
                    }],
                    "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
                },
                # Panel 2: Pipeline value by stage
                {
                    "id": 2,
                    "title": "Pipeline Value",
                    "type": "bargauge",
                    "targets": [{
                        "expr": f'deepsynaps_crm_pipeline_value{{organization_id="{org_id}"}}',
                        "legendFormat": "{{stage}}"
                    }],
                    "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
                },
                # Panel 3: API request rate
                {
                    "id": 3,
                    "title": "API Request Rate",
                    "type": "graph",
                    "targets": [{
                        "expr": 'rate(deepsynaps_http_requests_total[5m])',
                        "legendFormat": "{{method}} {{endpoint}}"
                    }],
                    "gridPos": {"h": 8, "w": 24, "x": 0, "y": 8}
                },
                # Panel 4: P95 latency
                {
                    "id": 4,
                    "title": "P95 Request Latency",
                    "type": "timeseries",
                    "targets": [{
                        "expr": 'histogram_quantile(0.95, rate(deepsynaps_http_request_duration_seconds_bucket[5m]))',
                        "legendFormat": "{{method}} {{endpoint}}"
                    }],
                    "gridPos": {"h": 8, "w": 12, "x": 0, "y": 16}
                },
                # Panel 5: Support ticket resolution time
                {
                    "id": 5,
                    "title": "Ticket Resolution Time",
                    "type": "heatmap",
                    "targets": [{
                        "expr": 'rate(deepsynaps_crm_ticket_resolution_seconds_bucket[1h])',
                        "format": "heatmap"
                    }],
                    "gridPos": {"h": 8, "w": 12, "x": 12, "y": 16}
                }
            ]
        },
        "folderId": 0,
        "overwrite": True
    }
    
    response = grafanaclient.request("POST", "dashboards/db", json=dashboard_json)
    
    return response.json()

@app.get("/api/v1/monitoring/grafana/embed/{dashboard_uid}")
async def embed_grafana_dashboard(
    dashboard_uid: str,
    current_user: User = Depends(get_current_user)
):
    """Generate embed URL for Grafana dashboard"""
    
    # Create signed JWT for embedding (Grafana 8.0+)
    payload = {
        "sub": str(current_user.id),
        "name": current_user.email,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=1),
        "org_id": current_user.organization_id,
        "role": "Viewer"
    }
    
    token = jwt.encode(payload, GRAFANA_SECRET, algorithm="HS256")
    
    embed_url = f"{GRAFANA_URL}/d/{dashboard_uid}?orgId=1&kiosk&auth_token={token}"
    
    return {"embed_url": embed_url}

# Grafana data source provisioning for DeepSynaps PostgreSQL
@app.post("/api/v1/monitoring/grafana/datasources")
async def provision_datasource():
    """
    Provision PostgreSQL data source for Grafana.
    Run once during setup.
    """
    ds_config = {
        "name": "DeepSynaps PostgreSQL",
        "type": "postgres",
        "url": "postgres:5432",
        "database": "deepsynaps",
        "user": "grafana_readonly",
        "secureJsonData": {"password": "grafana-password"},
        "jsonData": {
            "sslmode": "disable",
            "maxOpenConns": 10,
            "maxIdleConns": 5,
            "connMaxLifetime": 14400,
            "timescaledb": True
        },
        "isDefault": True,
        "editable": False
    }
    
    response = grafanaclient.request("POST", "datasources", json=ds_config)
    return response.json()

# Annotation endpoint: Push CRM events as Grafana annotations
@app.post("/api/v1/monitoring/grafana/annotations")
async def create_annotation(event: dict):
    """
    Create Grafana annotation for CRM events.
    E.g., deal closed, escalation, etc.
    """
    annotation = {
        "dashboardId": event.get("dashboard_id"),
        "panelId": event.get("panel_id"),
        "time": int(datetime.utcnow().timestamp() * 1000),
        "tags": ["crm", event.get("event_type")],
        "text": event.get("description", "CRM Event")
    }
    
    response = grafanaclient.request("POST", "annotations", json=annotation)
    return response.json()

# SQL queries for Grafana PostgreSQL data source
GRAFANA_SQL_QUERIES = {
    "contacts_by_month": """
        SELECT
            DATE_TRUNC('month', created_at) as time,
            status,
            COUNT(*) as count
        FROM contacts
        WHERE created_at >= $__timeFrom() AND created_at <= $__timeTo()
        GROUP BY 1, 2
        ORDER BY 1
    """,
    "deals_pipeline": """
        SELECT
            stage,
            COUNT(*) as deal_count,
            SUM(value) as total_value
        FROM deals
        WHERE created_at >= $__timeFrom()
        GROUP BY stage
    """,
    "revenue_by_month": """
        SELECT
            DATE_TRUNC('month', actual_close_date) as time,
            SUM(value) as revenue,
            COUNT(*) as closed_deals
        FROM deals
        WHERE stage = 'closed_won'
        AND actual_close_date >= $__timeFrom()
        AND actual_close_date <= $__timeTo()
        GROUP BY 1
        ORDER BY 1
    """,
    "user_activity": """
        SELECT
            DATE_TRUNC('day', created_at) as time,
            type,
            COUNT(*) as count
        FROM activities
        WHERE created_at >= $__timeFrom()
        GROUP BY 1, 2
        ORDER BY 1
    """
}
```

**Limitations:**
- AGPL license (embedding and SaaS considerations)
- Resource-intensive for large deployments
- Alerting rules are configuration-based (no UI for complex rules)
- Dashboard JSON can be verbose
- Plugin quality varies
- Enterprise features require paid Cloud/Enterprise plan
- Loki/Tempo add significant infrastructure complexity
- Annotation system limited compared to dedicated event tools

---

### 5.3 Jaeger (Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Jaeger |
| **Language** | Go |
| **License** | Apache 2.0 |
| **GitHub URL** | https://github.com/jaegertracing/jaeger |
| **Stars** | 23,000+ |
| **Website** | https://www.jaegertracing.io |

**Key Features:**
- Distributed tracing system (CNCF graduated project)
- OpenTelemetry compatible
- Adaptive sampling
- Service dependency analysis
- Performance and latency optimization
- Root cause analysis
- Multiple storage backends (Elasticsearch, Cassandra, Kafka, Badger)
- Jaeger UI for trace visualization
- Instrumentation libraries for Go, Java, Node.js, Python, C++
- W3C Trace Context support
- Service performance monitoring
- Alerting integration

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Jaeger/OpenTelemetry distributed tracing
from fastapi import FastAPI, Request
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

# Configure Jaeger exporter
jaeger_exporter = JaegerExporter(
    agent_host_name="jaeger-agent",
    agent_port=6831,
    # Or use collector endpoint:
    # collector_endpoint="http://jaeger-collector:14268/api/traces"
)

# Configure tracer provider
resource = Resource.create({SERVICE_NAME: "deepsynaps-crm-api"})
tracer_provider = TracerProvider(resource=resource)
span_processor = BatchSpanProcessor(jaeger_exporter)
tracer_provider.add_span_processor(span_processor)
trace.set_tracer_provider(tracer_provider)

tracer = trace.get_tracer(__name__)

# Instrument FastAPI
app = FastAPI()
FastAPIInstrumentor.instrument_app(app)

# Instrument SQLAlchemy (captures all DB queries)
SQLAlchemyInstrumentor().instrument()

# Instrument Redis
RedisInstrumentor().instrument()

# Custom span creation for business logic
@app.post("/api/v1/deals")
async def create_deal(deal: DealCreate, request: Request):
    """Create deal with detailed tracing"""
    
    with tracer.start_as_current_span("deal.create") as span:
        span.set_attribute("deal.title", deal.title)
        span.set_attribute("deal.value", deal.value)
        span.set_attribute("deal.stage", deal.stage)
        span.set_attribute("user.id", request.state.user_id)
        span.set_attribute("organization.id", deal.organization_id)
        
        # Trace contact validation
        with tracer.start_span("deal.validate_contact") as validate_span:
            contact = db.query(Contact).filter(Contact.id == deal.contact_id).first()
            validate_span.set_attribute("contact.found", contact is not None)
            if not contact:
                validate_span.set_status(trace.Status(trace.StatusCode.ERROR, "Contact not found"))
                raise HTTPException(status_code=404, detail="Contact not found")
        
        # Trace deal creation
        with tracer.start_span("deal.insert_db") as db_span:
            db_deal = Deal(**deal.dict())
            db.add(db_deal)
            db.commit()
            db_span.set_attribute("deal.id", db_deal.id)
        
        # Trace activity logging
        with tracer.start_span("deal.log_activity") as activity_span:
            activity = Activity(
                type="deal_created",
                description=f"Deal '{deal.title}' created",
                deal_id=db_deal.id,
                organization_id=deal.organization_id
            )
            db.add(activity)
            db.commit()
        
        # Trace notification
        with tracer.start_span("deal.send_notification") as notify_span:
            await notification_service.notify_deal_created(db_deal)
            notify_span.set_attribute("notification.sent", True)
        
        span.set_attribute("deal.created_id", db_deal.id)
        span.set_status(trace.Status(trace.StatusCode.OK))
    
    return {"deal_id": db_deal.id}

# Propagate trace context to external services
async def call_external_service(url: str, data: dict):
    """Propagate trace context to downstream services"""
    headers = {}
    TraceContextTextMapPropagator().inject(headers)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=data, headers=headers)
        return response.json()

# Middleware to extract trace context from incoming requests
@app.middleware("http")
async def trace_context_middleware(request: Request, call_next):
    """Extract trace context from incoming requests"""
    propagator = TraceContextTextMapPropagator()
    context = propagator.extract(carrier=dict(request.headers))
    
    # Store in request state for use in route handlers
    request.state.trace_context = context
    
    response = await call_next(request)
    return response

# Database query performance tracing
@app.get("/api/v1/tracing/slow-queries")
async def get_slow_traces(
    min_duration_ms: int = 100,
    service: str = "deepsynaps-crm-api"
):
    """
    Query Jaeger for slow traces via Jaeger HTTP API.
    """
    import requests
    
    # Query Jaeger API
    params = {
        "service": service,
        "minDuration": f"{min_duration_ms * 1000}us",  # microseconds
        "limit": 100,
        "lookback": "1h"
    }
    
    response = requests.get(
        "http://jaeger-query:16686/api/traces",
        params=params
    )
    
    traces = response.json().get("data", [])
    
    return {
        "slow_traces": [
            {
                "trace_id": trace["traceID"],
                "duration_ms": sum(s["duration"] for s in trace["spans"]) / 1000,
                "spans": len(trace["spans"]),
                "services": list(set(p["serviceName"] for p in trace.get("processes", {}).values()))
            }
            for trace in traces
        ]
    }
```

**Limitations:**
- Requires infrastructure for collector and storage
- Go client is native; Python has OpenTelemetry overhead
- Storage backend (Elasticsearch/Cassandra) adds complexity
- Adaptive sampling can miss rare but important traces
- UI can be slow with large traces
- Trace retention depends on storage capacity
- Context propagation requires library support across all services

---

### 5.4 ELK Stack (SSPL/Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | ELK Stack (Elasticsearch, Logstash, Kibana) |
| **Language** | Java/Ruby/JavaScript |
| **License** | SSPL (Elasticsearch) / Apache 2.0 (some components) |
| **GitHub URL** | https://github.com/elastic/elasticsearch |
| **Stars** | 71,000+ (Elasticsearch) |
| **Website** | https://www.elastic.co/elastic-stack |

**Key Features:**
- Elasticsearch: distributed search and analytics engine
- Logstash: data processing pipeline for logs
- Kibana: visualization and exploration UI
- Full-text search with analyzers
- Structured and unstructured log aggregation
- Machine learning for anomaly detection
- Alerting and reporting
- Index lifecycle management
- Beats: lightweight log shippers
- Security features (authentication, encryption, RBAC)
- Geo-spatial queries
- Aggregation framework for analytics

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: ELK Stack integration for log aggregation
from fastapi import FastAPI, Request
from pythonjsonlogger import jsonlogger
import logging
import elasticsearch
from elasticsearch import Elasticsearch
from datetime import datetime
import traceback
import uuid

# Configure JSON logging for Logstash
def setup_json_logging():
    logHandler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        '%(timestamp)s %(level)s %(name)s %(message)s %(trace_id)s %(user_id)s %(duration_ms)s',
        rename_fields={"levelname": "level", "asctime": "timestamp"}
    )
    logHandler.setFormatter(formatter)
    
    logger = logging.getLogger("deepsynaps")
    logger.addHandler(logHandler)
    logger.setLevel(logging.INFO)
    return logger

logger = setup_json_logging()

# Elasticsearch client
es = Elasticsearch(["http://elasticsearch:9200"])
INDEX_PREFIX = "deepsynaps-logs"

# Request logging middleware with correlation IDs
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    request.state.trace_id = trace_id
    
    start_time = time.time()
    
    # Log request
    logger.info(
        "Incoming request",
        extra={
            "trace_id": trace_id,
            "method": request.method,
            "path": request.url.path,
            "query": str(request.query_params),
            "user_agent": request.headers.get("user-agent"),
            "client_ip": request.client.host if request.client else None
        }
    )
    
    try:
        response = await call_next(request)
        duration = (time.time() - start_time) * 1000
        
        # Log response
        logger.info(
            "Request completed",
            extra={
                "trace_id": trace_id,
                "status_code": response.status_code,
                "duration_ms": round(duration, 2)
            }
        )
        
        # Index to Elasticsearch directly
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "trace_id": trace_id,
            "level": "INFO",
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration, 2),
            "user_id": getattr(request.state, "user_id", None),
            "organization_id": getattr(request.state, "organization_id", None)
        }
        
        es.index(index=f"{INDEX_PREFIX}-{datetime.utcnow().strftime('%Y.%m.%d')}", body=log_entry)
        
        response.headers["X-Trace-ID"] = trace_id
        return response
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        
        logger.error(
            "Request failed",
            extra={
                "trace_id": trace_id,
                "error": str(e),
                "stacktrace": traceback.format_exc(),
                "duration_ms": round(duration, 2)
            }
        )
        raise

# Direct Elasticsearch logging for business events
@app.post("/api/v1/activities")
async def log_business_activity(activity: ActivityCreate, request: Request):
    """Log activity to both database and Elasticsearch"""
    
    # Save to PostgreSQL
    db_activity = Activity(**activity.dict())
    db.add(db_activity)
    db.commit()
    
    # Index to Elasticsearch for full-text search and analytics
    es_doc = {
        "timestamp": datetime.utcnow().isoformat(),
        "trace_id": request.state.trace_id,
        "event_type": activity.type,
        "description": activity.description,
        "user_id": activity.user_id,
        "organization_id": activity.organization_id,
        "contact_id": activity.contact_id,
        "deal_id": activity.deal_id,
        "metadata": activity.metadata
    }
    
    es.index(index="deepsynaps-activities", body=es_doc)
    
    return db_activity

# Search logs via Elasticsearch
@app.get("/api/v1/logs/search")
async def search_logs(
    query: str,
    start_date: datetime = None,
    end_date: datetime = None,
    organization_id: int = None,
    level: str = None,
    limit: int = 100
):
    """Search application logs via Elasticsearch"""
    
    must_clauses = [
        {"multi_match": {"query": query, "fields": ["message", "description", "error", "path"]}}
    ]
    
    if start_date and end_date:
        must_clauses.append({
            "range": {"timestamp": {"gte": start_date.isoformat(), "lte": end_date.isoformat()}}
        })
    
    if organization_id:
        must_clauses.append({"term": {"organization_id": organization_id}})
    
    if level:
        must_clauses.append({"term": {"level": level.upper()}})
    
    search_body = {
        "query": {"bool": {"must": must_clauses}},
        "sort": [{"timestamp": {"order": "desc"}}],
        "size": limit
    }
    
    result = es.search(index="deepsynaps-*", body=search_body)
    
    return {
        "total": result["hits"]["total"]["value"],
        "logs": [hit["_source"] for hit in result["hits"]["hits"]]
    }

# Kibana dashboard export for CRM monitoring
KIBANA_DASHBOARD_EXPORT = {
    "version": "8.0.0",
    "objects": [
        {
            "id": "deepsynaps-request-logs",
            "type": "dashboard",
            "attributes": {
                "title": "DeepSynaps Request Logs",
                "hits": 0,
                "description": "API request monitoring dashboard",
                "panelsJSON": json.dumps([
                    {
                        "id": "requests-over-time",
                        "type": "visualization",
                        "panelIndex": 1,
                        "gridData": {"x": 0, "y": 0, "w": 24, "h": 15},
                        "version": "8.0.0"
                    },
                    {
                        "id": "status-code-distribution",
                        "type": "visualization",
                        "panelIndex": 2,
                        "gridData": {"x": 0, "y": 15, "w": 12, "h": 15},
                        "version": "8.0.0"
                    },
                    {
                        "id": "slow-requests",
                        "type": "visualization",
                        "panelIndex": 3,
                        "gridData": {"x": 12, "y": 15, "w": 12, "h": 15},
                        "version": "8.0.0"
                    }
                ])
            }
        }
    ]
}
```

**Limitations:**
- SSPL license for Elasticsearch (controversial; may not be truly open-source)
- Heavy JVM-based resource requirements
- Complex cluster setup and management
- Kibana has learning curve
- Index management requires planning (shards, retention)
- Security features behind paid license historically
- Logstash can be slow; alternatives like Fluentd often preferred
- Version upgrades can be breaking

---

### 5.5 Uptime Kuma (MIT)

| Attribute | Detail |
|-----------|--------|
| **Name** | Uptime Kuma |
| **Language** | JavaScript/Node.js |
| **License** | MIT |
| **GitHub URL** | https://github.com/louislam/uptime-kuma |
| **Stars** | 71,300+ |
| **Website** | https://uptime.kuma.pet |

**Key Features:**
- Self-hosted uptime monitoring tool
- HTTP/HTTPS/TCP/Ping/DNS monitoring
- Keyword monitoring
- SSL certificate expiry monitoring
- Docker container monitoring
- Real-time notifications (70+ notification services)
- Status page generation
- Multi-language support
- Two-factor authentication
- Lightweight (single Node.js process)
- Simple setup with SQLite
- Prometheus metrics export
- Incident timeline

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Uptime Kuma integration
from fastapi import FastAPI
import requests

UPTIME_KUMA_URL = "http://uptime-kuma:3001"
UPTIME_KUMA_USERNAME = "admin"
UPTIME_KUMA_PASSWORD = "admin"

class UptimeKumaClient:
    def __init__(self):
        self.base_url = UPTIME_KUMA_URL
        self.token = None
    
    def login(self):
        response = requests.post(
            f"{self.base_url}/login",
            json={"username": UPTIME_KUMA_USERNAME, "password": UPTIME_KUMA_PASSWORD}
        )
        self.token = response.json()["token"]
    
    def request(self, method: str, endpoint: str, **kwargs):
        if not self.token:
            self.login()
        
        url = f"{self.base_url}{endpoint}"
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.token}"
        
        return requests.request(method, url, headers=headers, **kwargs)

kuma = UptimeKumaClient()

@app.post("/api/v1/monitoring/uptime/monitors")
async def create_monitor(config: dict):
    """Create uptime monitor for customer-facing endpoints"""
    
    payload = {
        "type": config.get("type", "http"),
        "name": config["name"],
        "url": config["url"],
        "interval": config.get("interval", 60),
        "retryInterval": config.get("retry_interval", 60),
        "maxretries": config.get("max_retries", 3),
        "timeout": config.get("timeout", 48),
        "notificationIDList": config.get("notification_ids", []),
        "ignoreTls": config.get("ignore_tls", False),
        "accepted_statuscodes": config.get("status_codes", ["200-299"]),
        "proxy": config.get("proxy", False),
        "method": config.get("method", "GET"),
        "body": config.get("body", ""),
        "headers": config.get("headers", ""),
        "expiryNotification": True,
        "ignoreTls": False
    }
    
    response = kuma.request("POST", "/api/monitor", json=payload)
    return response.json()

@app.get("/api/v1/monitoring/uptime/status")
async def get_uptime_status():
    """Get overall uptime status from Uptime Kuma"""
    response = kuma.request("GET", "/api/status-page/monitor-list")
    return response.json()

@app.get("/api/v1/monitoring/uptime/beats/{monitor_id}")
async def get_monitor_beats(monitor_id: int, duration: int = 24):
    """Get heartbeat data for a monitor"""
    response = kuma.request(
        "GET",
        f"/api/monitor/{monitor_id}/beats",
        params={"duration": duration}
    )
    return response.json()
```

**Limitations:**
- Not a full observability platform (focused on uptime only)
- SQLite default (PostgreSQL/MySQL requires manual config)
- No distributed tracing
- No metrics collection (only up/down)
- No log aggregation
- Scaling limitations for very large deployments
- API is less mature than UI

---

## Monitoring & Observability Tools Comparison

| Feature | Prometheus | Grafana | Jaeger | ELK Stack | Uptime Kuma |
|---------|------------|---------|--------|-----------|-------------|
| **License** | Apache 2.0 | AGPL-3.0 | Apache 2.0 | SSPL/Apache | MIT |
| **Stars** | 58K+ | 68.7K+ | 23K+ | 71K+ | 71.3K+ |
| **Language** | Go | Go/TS | Go | Java/Ruby/JS | Node.js |
| **Type** | Metrics | Visualization | Tracing | Logs | Uptime |
| **Storage** | TSDB (local) | External | ES/Cassandra | Elasticsearch | SQLite/PostgreSQL |
| **Query Lang** | PromQL | - | - | Lucene/DSL | - |
| **Alerting** | Alertmanager | Built-in | No | Watcher/ML | Built-in |
| **FastAPI Integration** | Client library | Data source | OpenTelemetry | Logging | REST API |
| **Resource Usage** | Low | Medium | Medium-High | High | Low |
| **Best For** | Metrics | Dashboards | Distributed tracing | Log search | Uptime monitoring |
| **DeepSynaps Fit** | **Excellent** | **Excellent** | Good | Good | Good |

---

## 6. Audit Logging

### 6.1 Custom FastAPI Middleware Patterns

Building a comprehensive audit logging system directly into FastAPI provides maximum control and integration with the DeepSynaps business logic.

```python
# FastAPI: Comprehensive audit logging system
from fastapi import FastAPI, Request, Depends
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, 
    JSON, event, func, Index, BigInteger
)
from sqlalchemy.orm import Session, declarative_base
from sqlalchemy.dialects.postgresql import INET, UUID, JSONB
from datetime import datetime
import json
import uuid
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
import hashlib
import hmac

Base = declarative_base()

# Audit Log Models
class AuditAction(str, Enum):
    CREATE = "CREATE"
    READ = "READ"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    EXPORT = "EXPORT"
    IMPORT = "IMPORT"
    LOGIN_FAILED = "LOGIN_FAILED"
    PASSWORD_CHANGE = "PASSWORD_CHANGE"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    API_KEY_CREATED = "API_KEY_CREATED"
    API_KEY_REVOKED = "API_KEY_REVOKED"

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Actor information
    user_id = Column(Integer, nullable=True)  # NULL for system actions
    user_email = Column(String(255), nullable=True)
    user_role = Column(String(50), nullable=True)
    api_key_id = Column(String(100), nullable=True)
    impersonator_id = Column(Integer, nullable=True)  # For admin impersonation
    
    # Action details
    action = Column(String(30), nullable=False)
    resource_type = Column(String(50), nullable=False)  # contact, deal, user, etc.
    resource_id = Column(String(100), nullable=True)
    
    # Request context
    ip_address = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)
    request_method = Column(String(10), nullable=True)
    request_path = Column(Text, nullable=True)
    request_query = Column(Text, nullable=True)
    trace_id = Column(UUID(as_uuid=True), nullable=True)
    
    # Change tracking
    before_values = Column(JSONB, nullable=True)  # Previous state
    after_values = Column(JSONB, nullable=True)   # New state
    changed_fields = Column(JSONB, nullable=True)  # List of changed field names
    
    # Organization context
    organization_id = Column(Integer, nullable=True)
    
    # Integrity
    signature = Column(String(128), nullable=True)  # HMAC for tamper detection
    
    # Indexes for common queries
    __table_args__ = (
        Index('idx_audit_timestamp', 'timestamp'),
        Index('idx_audit_user', 'user_id', 'timestamp'),
        Index('idx_audit_action', 'action', 'resource_type'),
        Index('idx_audit_org', 'organization_id', 'timestamp'),
        Index('idx_audit_resource', 'resource_type', 'resource_id'),
        Index('idx_audit_trace', 'trace_id'),
    )

# Audit configuration
class AuditConfig:
    """Configure which actions and resources to audit"""
    
    # Resources to audit (all actions)
    AUDITED_RESOURCES = {
        "contacts", "deals", "organizations", "users",
        "activities", "tasks", "notes", "documents",
        "workflows", "automations", "templates",
        "billing", "subscriptions", "invoices"
    }
    
    # Sensitive fields to mask
    SENSITIVE_FIELDS = {
        "password", "password_hash", "ssn", "tax_id",
        "credit_card", "cvv", "api_key", "secret",
        "token", "authorization"
    }
    
    # Fields to exclude from audit (too large/noisy)
    EXCLUDED_FIELDS = {
        "updated_at", "created_at", "version", "search_vector"
    }
    
    @classmethod
    def should_audit(cls, resource_type: str) -> bool:
        return resource_type.lower() in cls.AUDITED_RESOURCES
    
    @classmethod
    def mask_sensitive(cls, data: dict) -> dict:
        """Mask sensitive fields in audit log"""
        if not data:
            return data
        
        masked = {}
        for key, value in data.items():
            if any(sensitive in key.lower() for sensitive in cls.SENSITIVE_FIELDS):
                masked[key] = "***MASKED***"
            elif isinstance(value, dict):
                masked[key] = cls.mask_sensitive(value)
            elif isinstance(value, list):
                masked[key] = [
                    cls.mask_sensitive(item) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                masked[key] = value
        return masked

# Audit middleware
class AuditMiddleware:
    def __init__(self, app: FastAPI, db_session_factory, secret_key: str):
        self.app = app
        self.db_session_factory = db_session_factory
        self.secret_key = secret_key.encode()
    
    def _sign_entry(self, entry_data: dict) -> str:
        """Create HMAC signature for audit entry integrity"""
        data = json.dumps(entry_data, sort_keys=True, default=str)
        return hmac.new(
            self.secret_key,
            data.encode(),
            hashlib.sha512
        ).hexdigest()
    
    def _get_changes(self, before: dict, after: dict) -> List[str]:
        """Determine which fields changed"""
        if not before or not after:
            return list(after.keys()) if after else []
        
        changed = []
        for key in after:
            if key not in before or before[key] != after[key]:
                changed.append(key)
        return changed
    
    async def __call__(self, request: Request, call_next):
        # Skip non-API routes
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        
        # Generate trace ID
        trace_id = uuid.uuid4()
        request.state.trace_id = trace_id
        
        # Capture request body for mutation operations
        body = None
        if request.method in ("POST", "PUT", "PATCH"):
            body = await request.body()
            # Replace body so route can still read it
            async def receive():
                return {"type": "http.request", "body": body}
            request._receive = receive
        
        # Execute request
        start_time = datetime.utcnow()
        response = await call_next(request)
        
        # Determine if we should audit this request
        resource_type = self._extract_resource_type(request.url.path)
        if not AuditConfig.should_audit(resource_type):
            return response
        
        # Get user info from request state
        user_id = getattr(request.state, "user_id", None)
        user_email = getattr(request.state, "user_email", None)
        user_role = getattr(request.state, "user_role", None)
        org_id = getattr(request.state, "organization_id", None)
        
        # Determine action type
        action = self._determine_action(request.method, response.status_code)
        
        # Extract resource ID from path
        resource_id = self._extract_resource_id(request.url.path)
        
        # Build audit entry
        entry_data = {
            "timestamp": start_time.isoformat(),
            "user_id": user_id,
            "user_email": user_email,
            "user_role": user_role,
            "action": action.value,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip_address": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "request_method": request.method,
            "request_path": request.url.path,
            "request_query": str(request.query_params),
            "trace_id": trace_id,
            "organization_id": org_id,
            "before_values": None,
            "after_values": None,
            "changed_fields": None
        }
        
        # Sign the entry
        signature = self._sign_entry(entry_data)
        
        # Store in database (async-safe)
        try:
            db = self.db_session_factory()
            audit_entry = AuditLog(
                **{k: v for k, v in entry_data.items() if hasattr(AuditLog, k)},
                signature=signature
            )
            db.add(audit_entry)
            db.commit()
            db.close()
        except Exception as e:
            # Audit logging should not break the application
            logger.error(f"Failed to write audit log: {e}")
        
        response.headers["X-Audit-Log-ID"] = str(trace_id)
        return response
    
    def _extract_resource_type(self, path: str) -> str:
        parts = path.strip("/").split("/")
        if len(parts) >= 2 and parts[0] == "api":
            return parts[2] if len(parts) > 2 else "unknown"
        return "unknown"
    
    def _extract_resource_id(self, path: str) -> Optional[str]:
        parts = path.strip("/").split("/")
        if len(parts) >= 4:
            return parts[3]
        return None
    
    def _determine_action(self, method: str, status_code: int) -> AuditAction:
        if status_code == 403:
            return AuditAction.PERMISSION_DENIED
        
        action_map = {
            "GET": AuditAction.READ,
            "POST": AuditAction.CREATE,
            "PUT": AuditAction.UPDATE,
            "PATCH": AuditAction.UPDATE,
            "DELETE": AuditAction.DELETE
        }
        return action_map.get(method, AuditAction.READ)

# SQLAlchemy event listeners for automatic audit logging
from sqlalchemy import event

def attach_audit_listeners():
    """Attach SQLAlchemy event listeners for automatic change tracking"""
    
    @event.listens_for(Session, "before_flush")
    def before_flush(session, flush_context, instances):
        """Capture state before changes are committed"""
        session._audit_snapshots = {}
        
        for obj in session.dirty:
            if hasattr(obj, "__tablename__"):
                table_name = obj.__tablename__
                if AuditConfig.should_audit(table_name):
                    # Get original state from database
                    old_values = {}
                    for attr in obj.__table__.columns:
                        history = getattr(obj.__class__, attr.key).history
                        if history.has_changes():
                            old_values[attr.key] = history.deleted[0] if history.deleted else None
                    
                    session._audit_snapshots[id(obj)] = {
                        "action": AuditAction.UPDATE,
                        "table": table_name,
                        "old_values": AuditConfig.mask_sensitive(old_values),
                        "resource_id": getattr(obj, "id", None)
                    }
        
        for obj in session.deleted:
            if hasattr(obj, "__tablename__"):
                table_name = obj.__tablename__
                if AuditConfig.should_audit(table_name):
                    old_values = {col.key: getattr(obj, col.key) for col in obj.__table__.columns}
                    session._audit_snapshots[id(obj)] = {
                        "action": AuditAction.DELETE,
                        "table": table_name,
                        "old_values": AuditConfig.mask_sensitive(old_values),
                        "resource_id": getattr(obj, "id", None)
                    }
    
    @event.listens_for(Session, "after_flush")
    def after_flush(session, flush_context):
        """Log changes after flush"""
        if not hasattr(session, "_audit_snapshots"):
            return
        
        for obj in session.new:
            if hasattr(obj, "__tablename__"):
                table_name = obj.__tablename__
                if AuditConfig.should_audit(table_name):
                    new_values = {col.key: getattr(obj, col.key) for col in obj.__table__.columns}
                    _write_audit_entry(
                        action=AuditAction.CREATE,
                        resource_type=table_name,
                        resource_id=getattr(obj, "id", None),
                        after_values=AuditConfig.mask_sensitive(new_values)
                    )
        
        for obj_id, snapshot in getattr(session, "_audit_snapshots", {}).items():
            if snapshot["action"] == AuditAction.UPDATE:
                # Get new values
                for obj in session.dirty:
                    if id(obj) == obj_id:
                        new_values = {col.key: getattr(obj, col.key) for col in obj.__table__.columns}
                        changed = [
                            col.key for col in obj.__table__.columns
                            if snapshot["old_values"].get(col.key) != new_values.get(col.key)
                        ]
                        
                        _write_audit_entry(
                            action=AuditAction.UPDATE,
                            resource_type=snapshot["table"],
                            resource_id=snapshot["resource_id"],
                            before_values=snapshot["old_values"],
                            after_values=AuditConfig.mask_sensitive(new_values),
                            changed_fields=changed
                        )
                        break
            elif snapshot["action"] == AuditAction.DELETE:
                _write_audit_entry(
                    action=AuditAction.DELETE,
                    resource_type=snapshot["table"],
                    resource_id=snapshot["resource_id"],
                    before_values=snapshot["old_values"]
                )
        
        session._audit_snapshots = {}

def _write_audit_entry(action, resource_type, resource_id, 
                       before_values=None, after_values=None, changed_fields=None):
    """Write audit entry to database"""
    # Implementation depends on your async context
    pass

# Audit log query API
class AuditLogQuery(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    user_id: Optional[int] = None
    action: Optional[AuditAction] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    organization_id: Optional[int] = None
    page: int = 1
    per_page: int = 50

@app.get("/api/v1/audit-logs")
async def query_audit_logs(
    query: AuditLogQuery = Depends(),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Query audit logs with filtering.
    Admin only endpoint.
    """
    q = db.query(AuditLog)
    
    if query.start_date:
        q = q.filter(AuditLog.timestamp >= query.start_date)
    if query.end_date:
        q = q.filter(AuditLog.timestamp <= query.end_date)
    if query.user_id:
        q = q.filter(AuditLog.user_id == query.user_id)
    if query.action:
        q = q.filter(AuditLog.action == query.action)
    if query.resource_type:
        q = q.filter(AuditLog.resource_type == query.resource_type)
    if query.resource_id:
        q = q.filter(AuditLog.resource_id == query.resource_id)
    if query.organization_id:
        q = q.filter(AuditLog.organization_id == query.organization_id)
    
    total = q.count()
    logs = q.order_by(AuditLog.timestamp.desc()) \
            .offset((query.page - 1) * query.per_page) \
            .limit(query.per_page) \
            .all()
    
    return {
        "total": total,
        "page": query.page,
        "per_page": query.per_page,
        "data": [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "user_id": log.user_id,
                "user_email": log.user_email,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "ip_address": str(log.ip_address) if log.ip_address else None,
                "request_method": log.request_method,
                "request_path": log.request_path,
                "changed_fields": log.changed_fields,
                "has_signature": log.signature is not None
            }
            for log in logs
        ]
    }

@app.get("/api/v1/audit-logs/{log_id}/verify")
async def verify_audit_log(
    log_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Verify audit log entry integrity using HMAC signature.
    """
    log = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404)
    
    entry_data = {
        "timestamp": log.timestamp.isoformat(),
        "user_id": log.user_id,
        "user_email": log.user_email,
        "user_role": log.user_role,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "ip_address": str(log.ip_address) if log.ip_address else None,
        "user_agent": log.user_agent,
        "request_method": log.request_method,
        "request_path": log.request_path,
        "request_query": log.request_query,
        "trace_id": str(log.trace_id) if log.trace_id else None,
        "organization_id": log.organization_id,
        "before_values": log.before_values,
        "after_values": log.after_values,
        "changed_fields": log.changed_fields
    }
    
    computed_signature = hmac.new(
        AUDIT_SECRET_KEY.encode(),
        json.dumps(entry_data, sort_keys=True, default=str).encode(),
        hashlib.sha512
    ).hexdigest()
    
    is_valid = hmac.compare_digest(computed_signature, log.signature or "")
    
    return {
        "log_id": log_id,
        "integrity_verified": is_valid,
        "computed_signature": computed_signature,
        "stored_signature": log.signature,
        "entry": entry_data
    }

@app.get("/api/v1/audit-logs/resource/{resource_type}/{resource_id}/timeline")
async def get_resource_audit_timeline(
    resource_type: str,
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get complete audit timeline for a specific resource.
    Useful for compliance and debugging.
    """
    logs = db.query(AuditLog) \
        .filter(AuditLog.resource_type == resource_type) \
        .filter(AuditLog.resource_id == resource_id) \
        .order_by(AuditLog.timestamp.asc()) \
        .all()
    
    return {
        "resource_type": resource_type,
        "resource_id": resource_id,
        "total_events": len(logs),
        "timeline": [
            {
                "timestamp": log.timestamp.isoformat(),
                "action": log.action,
                "user_id": log.user_id,
                "user_email": log.user_email,
                "changes": {
                    "before": log.before_values,
                    "after": log.after_values,
                    "fields": log.changed_fields
                }
            }
            for log in logs
        ]
    }
```

**Benefits of Custom Approach:**
- Full control over data structure and retention
- Direct integration with business logic
- Can enforce organization-level isolation
- HMAC signatures for tamper detection
- Custom query patterns optimized for CRM use cases
- No additional infrastructure dependencies

**Limitations:**
- Requires ongoing maintenance
- Database storage can grow large (consider archiving)
- Must handle high-throughput scenarios carefully
- No built-in visualization (build your own or use Grafana)

---

### 6.2 PostgreSQL Audit Triggers

Using PostgreSQL triggers provides database-level auditing that captures all changes regardless of application path.

```sql
-- PostgreSQL: Comprehensive audit trigger system
-- Install pgAudit extension if available
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Audit log table
CREATE TABLE audit.logs (
    id BIGSERIAL PRIMARY KEY,
    schema_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
    row_id TEXT,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    application_user_id INTEGER,
    application_user_email TEXT,
    client_addr INET,
    client_port INTEGER,
    transaction_id BIGINT,
    statement_timestamp TIMESTAMPTZ DEFAULT statement_timestamp(),
    clock_timestamp TIMESTAMPTZ DEFAULT clock_timestamp(),
    session_user_name TEXT DEFAULT session_user
);

-- Indexes for performance
CREATE INDEX idx_audit_logs_timestamp ON audit.logs (statement_timestamp);
CREATE INDEX idx_audit_logs_table ON audit.logs (schema_name, table_name);
CREATE INDEX idx_audit_logs_action ON audit.logs (action);
CREATE INDEX idx_audit_logs_row ON audit.logs (table_name, row_id);
CREATE INDEX idx_audit_logs_user ON audit.logs (application_user_id);

-- Helper function to set application context
CREATE OR REPLACE FUNCTION audit.set_app_user(
    p_user_id INTEGER,
    p_user_email TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, FALSE);
    PERFORM set_config('app.current_user_email', p_user_email, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Main audit trigger function
CREATE OR REPLACE FUNCTION audit.trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB;
    v_new_data JSONB;
    v_row_id TEXT;
    v_changed_fields TEXT[];
    v_user_id INTEGER;
    v_user_email TEXT;
BEGIN
    -- Get application user from session variables
    BEGIN
        v_user_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::INTEGER;
        v_user_email := current_setting('app.current_user_email', TRUE);
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
        v_user_email := NULL;
    END;
    
    -- Get row identifier
    IF TG_OP = 'DELETE' THEN
        v_row_id := OLD.id::TEXT;
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;
        v_changed_fields := ARRAY(SELECT jsonb_object_keys(to_jsonb(OLD)));
    ELSIF TG_OP = 'INSERT' THEN
        v_row_id := NEW.id::TEXT;
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);
        v_changed_fields := ARRAY(SELECT jsonb_object_keys(to_jsonb(NEW)));
    ELSIF TG_OP = 'UPDATE' THEN
        v_row_id := NEW.id::TEXT;
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        
        -- Calculate changed fields
        SELECT ARRAY_AGG(key)
        INTO v_changed_fields
        FROM jsonb_each(v_new_data) AS new_kv
        JOIN jsonb_each(v_old_data) AS old_kv 
            ON new_kv.key = old_kv.key
        WHERE new_kv.value IS DISTINCT FROM old_kv.value;
    END IF;
    
    -- Mask sensitive fields
    v_old_data := audit.mask_sensitive(v_old_data);
    v_new_data := audit.mask_sensitive(v_new_data);
    
    -- Insert audit record
    INSERT INTO audit.logs (
        schema_name, table_name, action, row_id,
        old_data, new_data, changed_fields,
        application_user_id, application_user_email,
        client_addr, client_port, transaction_id
    ) VALUES (
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, v_row_id,
        v_old_data, v_new_data, v_changed_fields,
        v_user_id, v_user_email,
        inet_client_addr(), inet_client_port(),
        txid_current()
    );
    
    -- Return appropriate row
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to mask sensitive data
CREATE OR REPLACE FUNCTION audit.mask_sensitive(data JSONB)
RETURNS JSONB AS $$
BEGIN
    IF data IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Mask password fields
    IF data ? 'password_hash' THEN
        data := jsonb_set(data, '{password_hash}', '"***MASKED***"');
    END IF;
    IF data ? 'password' THEN
        data := jsonb_set(data, '{password}', '"***MASKED***"');
    END IF;
    IF data ? 'api_key' THEN
        data := jsonb_set(data, '{api_key}', '"***MASKED***"');
    END IF;
    IF data ? 'secret' THEN
        data := jsonb_set(data, '{secret}', '"***MASKED***"');
    END IF;
    
    RETURN data;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to CRM tables
CREATE OR REPLACE FUNCTION audit.enable_table_auditing(
    p_schema TEXT,
    p_table TEXT
) RETURNS VOID AS $$
BEGIN
    EXECUTE format(
        'CREATE TRIGGER %I_audit_trigger
         AFTER INSERT OR UPDATE OR DELETE ON %I.%I
         FOR EACH ROW EXECUTE FUNCTION audit.trigger_function();',
        p_table, p_schema, p_table
    );
END;
$$ LANGUAGE plpgsql;

-- Enable auditing on all CRM tables
SELECT audit.enable_table_auditing('public', 'contacts');
SELECT audit.enable_table_auditing('public', 'deals');
SELECT audit.enable_table_auditing('public', 'organizations');
SELECT audit.enable_table_auditing('public', 'users');
SELECT audit.enable_table_auditing('public', 'activities');
SELECT audit.enable_table_auditing('public', 'tasks');

-- Partitioning for large audit tables
CREATE TABLE audit.logs_2024 PARTITION OF audit.logs
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE audit.logs_2025 PARTITION OF audit.logs
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Automated archiving function
CREATE OR REPLACE FUNCTION audit.archive_old_logs(archive_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_archived INTEGER;
BEGIN
    -- Insert into archive table
    WITH archived AS (
        INSERT INTO audit.logs_archive
        SELECT * FROM audit.logs
        WHERE statement_timestamp < NOW() - INTERVAL '1 day' * archive_days
        RETURNING *
    )
    SELECT COUNT(*) INTO v_archived FROM archived;
    
    -- Delete from main table
    DELETE FROM audit.logs
    WHERE statement_timestamp < NOW() - INTERVAL '1 day' * archive_days;
    
    RETURN v_archived;
END;
$$ LANGUAGE plpgsql;

-- pgAudit configuration for session-level logging
ALTER SYSTEM SET pgaudit.log = 'write, ddl';
ALTER SYSTEM SET pgaudit.log_relation = 'on';
ALTER SYSTEM SET pgaudit.log_catalog = 'off';
SELECT pg_reload_conf();
```

**FastAPI Integration with PostgreSQL Audit:**

```python
# FastAPI: Set PostgreSQL audit context per request
from fastapi import Request
from sqlalchemy import text

@app.middleware("http")
async def postgres_audit_context(request: Request, call_next):
    """
    Set PostgreSQL session variables for audit trigger context.
    Must be called after authentication.
    """
    response = await call_next(request)
    
    user_id = getattr(request.state, "user_id", None)
    user_email = getattr(request.state, "user_email", None)
    
    if user_id:
        # Set PostgreSQL session variables
        db = next(get_db())
        db.execute(text("SELECT audit.set_app_user(:user_id, :user_email)"), {
            "user_id": user_id,
            "user_email": user_email
        })
        db.commit()
    
    return response

# Query audit logs
@app.get("/api/v1/audit/db-logs")
async def query_db_audit_logs(
    table: str = None,
    action: str = None,
    start_date: datetime = None,
    end_date: datetime = None,
    db: Session = Depends(get_db)
):
    """Query PostgreSQL audit trigger logs"""
    query = "SELECT * FROM audit.logs WHERE 1=1"
    params = {}
    
    if table:
        query += " AND table_name = :table"
        params["table"] = table
    if action:
        query += " AND action = :action"
        params["action"] = action
    if start_date:
        query += " AND statement_timestamp >= :start"
        params["start"] = start_date
    if end_date:
        query += " AND statement_timestamp <= :end"
        params["end"] = end_date
    
    query += " ORDER BY statement_timestamp DESC LIMIT 1000"
    
    result = db.execute(text(query), params).fetchall()
    
    return {
        "logs": [
            {
                "id": row.id,
                "timestamp": row.statement_timestamp.isoformat(),
                "table": row.table_name,
                "action": row.action,
                "row_id": row.row_id,
                "old_data": row.old_data,
                "new_data": row.new_data,
                "changed_fields": row.changed_fields,
                "user_id": row.application_user_id,
                "transaction_id": row.transaction_id
            }
            for row in result
        ]
    }
```

**Limitations:**
- Synchronous trigger execution adds latency to write operations
- Audit table can grow very large (requires partitioning/archiving)
- No built-in tamper detection at trigger level
- Must carefully manage session variables
- Limited context about HTTP request (no IP, user-agent)

---

### 6.3 TimescaleDB for Time-Series Audit

| Attribute | Detail |
|-----------|--------|
| **Name** | TimescaleDB |
| **Language** | C/PostgreSQL |
| **License** | Apache 2.0 (Extension) |
| **GitHub URL** | https://github.com/timescale/timescaledb |
| **Stars** | 18,500+ |

**Key Features:**
- PostgreSQL extension for time-series data
- Automatic partitioning (hypertables)
- Continuous aggregation for real-time analytics
- Data retention policies
- Compression for historical data
- Real-time aggregations
- Hyperfunctions for time-series analysis
- Full SQL compatibility
- Works with existing PostgreSQL tools

**Integration Path with FastAPI + SQLAlchemy:**

```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert audit table to hypertable
CREATE TABLE audit.timeseries_logs (
    time TIMESTAMPTZ NOT NULL,
    user_id INTEGER,
    organization_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    duration_ms INTEGER,
    success BOOLEAN,
    metadata JSONB,
    ip_address INET
);

-- Convert to hypertable (auto-partitioned by time)
SELECT create_hypertable('audit.timeseries_logs', 'time', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Enable compression for older chunks
ALTER TABLE audit.timeseries_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'organization_id, resource_type, action',
    timescaledb.compress_orderby = 'time DESC'
);

-- Retention policy: compress after 7 days, drop after 1 year
SELECT add_retention_policy('audit.timeseries_logs', 
    drop_after => INTERVAL '1 year');

SELECT add_compression_policy('audit.timeseries_logs', 
    compress_after => INTERVAL '7 days');

-- Continuous aggregate: hourly activity summary
CREATE MATERIALIZED VIEW audit.hourly_activity
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    organization_id,
    action,
    resource_type,
    COUNT(*) as event_count,
    AVG(duration_ms) as avg_duration_ms,
    COUNT(*) FILTER (WHERE success = false) as error_count
FROM audit.timeseries_logs
GROUP BY bucket, organization_id, action, resource_type;

-- Real-time aggregate (auto-refreshes)
SELECT add_continuous_aggregate_policy('audit.hourly_activity',
    start_offset => INTERVAL '1 month',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');
```

```python
# FastAPI: Write to TimescaleDB audit log
@app.middleware("http")
async def timescale_audit_middleware(request: Request, call_next):
    start = time.time()
    user_id = getattr(request.state, "user_id", None)
    org_id = getattr(request.state, "organization_id", None)
    
    try:
        response = await call_next(request)
        success = response.status_code < 500
    except Exception:
        success = False
        raise
    finally:
        duration = int((time.time() - start) * 1000)
        
        db = next(get_db())
        db.execute(text("""
            INSERT INTO audit.timeseries_logs 
            (time, user_id, organization_id, action, resource_type, 
             resource_id, duration_ms, success, metadata, ip_address)
            VALUES (NOW(), :user_id, :org_id, :action, :resource_type,
                    :resource_id, :duration, :success, :metadata, :ip)
        """), {
            "user_id": user_id,
            "org_id": org_id,
            "action": request.method,
            "resource_type": request.url.path.split("/")[3] if len(request.url.path.split("/")) > 3 else "unknown",
            "resource_id": request.url.path.split("/")[4] if len(request.url.path.split("/")) > 4 else None,
            "duration": duration,
            "success": success,
            "metadata": json.dumps({
                "status_code": getattr(response, 'status_code', 500),
                "user_agent": request.headers.get("user-agent"),
                "query": str(request.query_params)
            }),
            "ip": request.client.host if request.client else None
        })
        db.commit()

# Query aggregated audit data
@app.get("/api/v1/audit/hourly-activity")
async def get_hourly_activity(
    hours: int = 24,
    organization_id: int = None,
    db: Session = Depends(get_db)
):
    """Query continuously-aggregated hourly activity"""
    query = """
        SELECT * FROM audit.hourly_activity
        WHERE bucket >= NOW() - INTERVAL :hours
    """
    params = {"hours": f"{hours} hours"}
    
    if organization_id:
        query += " AND organization_id = :org_id"
        params["org_id"] = organization_id
    
    query += " ORDER BY bucket DESC"
    
    result = db.execute(text(query), params).fetchall()
    
    return {
        "hourly_activity": [
            {
                "hour": str(row.bucket),
                "organization_id": row.organization_id,
                "action": row.action,
                "resource_type": row.resource_type,
                "event_count": row.event_count,
                "avg_duration_ms": float(row.avg_duration_ms or 0),
                "error_count": row.error_count
            }
            for row in result
        ]
    }
```

**Limitations:**
- Requires TimescaleDB extension installation
- Adds complexity to PostgreSQL setup
- Continuous aggregates have refresh latency
- Compression trade-offs (query performance vs storage)
- Migration from regular PostgreSQL tables requires planning

---

### 6.4 PgAudit (PostgreSQL Extension)

| Attribute | Detail |
|-----------|--------|
| **Name** | pgAudit |
| **Language** | C |
| **License** | PostgreSQL License (MIT-like) |
| **GitHub URL** | https://github.com/pgaudit/pgaudit |

**Key Features:**
- Official PostgreSQL extension for session and object auditing
- Session-level logging of all statements
- Object-level logging for specific tables
- Detailed logging: role, statement, parameters
- Integrated with PostgreSQL logging infrastructure
- Configurable via PostgreSQL parameters
- Can log to file or syslog
- Supports `pgaudit.log_catalog`, `pgaudit.log_parameter`

**Configuration:**

```sql
-- Install pgAudit
CREATE EXTENSION pgaudit;

-- Configure pgAudit (postgresql.conf or ALTER SYSTEM)
-- Session logging: log all write operations
ALTER SYSTEM SET pgaudit.log = 'write, ddl';
ALTER SYSTEM SET pgaudit.log_relation = 'on';
ALTER SYSTEM SET pgaudit.log_catalog = 'off';  -- Don't log catalog queries
ALTER SYSTEM SET pgaudit.log_parameter = 'on';  -- Log bind parameters
ALTER SYSTEM SET pgaudit.log_statement_once = 'off';
ALTER SYSTEM SET pgaudit.role = 'auditor';

-- Object-level auditing for specific tables
-- Only log changes to sensitive tables
CREATE ROLE auditor;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Grant auditor role to see all rows
CREATE POLICY audit_all_contacts ON contacts
    FOR ALL TO auditor
    USING (true) WITH CHECK (true);

-- Apply pgAudit to specific tables only
SELECT pgaudit.audit_table('contacts');
SELECT pgaudit.audit_table('deals');
SELECT pgaudit.audit_table('users');

-- Reload configuration
SELECT pg_reload_conf();
```

```python
# FastAPI: Parse pgAudit logs
import re
from datetime import datetime
from pydantic import BaseModel

class PgAuditEntry(BaseModel):
    timestamp: datetime
    audit_type: str  # SESSION or OBJECT
    statement_id: str
    substatement_id: str
    class: str  # READ, WRITE, FUNCTION, ROLE, etc.
    command: str
    object_type: str
    object_name: str
    statement: str
    parameter: str

# pgAudit log parser
PGAUDIT_PATTERN = re.compile(
    r'AUDIT: \w+,\w+,\w+,'
    r'(?P<class>\w+),'
    r'(?P<command>\w+),'
    r'(?P<object_type>[^,]*),'
    r'(?P<object_name>[^,]*),'
    r'(?P<statement>.*)'
)

def parse_pgaudit_log_line(line: str) -> Optional[PgAuditEntry]:
    """Parse a pgAudit log line into structured data"""
    # Log format depends on PostgreSQL log_line_prefix
    # Standard format: timestamp [pid]: [session] AUDIT: ...
    
    if "AUDIT:" not in line:
        return None
    
    match = PGAUDIT_PATTERN.search(line)
    if not match:
        return None
    
    groups = match.groupdict()
    
    return PgAuditEntry(
        timestamp=datetime.now(),  # Parse from log line
        audit_type="SESSION",
        statement_id="",
        substatement_id="",
        class=groups["class"],
        command=groups["command"],
        object_type=groups["object_type"],
        object_name=groups["object_name"],
        statement=groups["statement"],
        parameter=""
    )

@app.get("/api/v1/audit/pgaudit-logs")
async def get_pgaudit_logs(
    lines: int = 100,
    current_user: User = Depends(require_admin)
):
    """
    Read and parse pgAudit logs.
    Requires log file access or log aggregation setup.
    """
    # In production, read from log aggregation system
    log_path = "/var/log/postgresql/postgresql-audit.log"
    
    try:
        with open(log_path, 'r') as f:
            all_lines = f.readlines()
            recent_lines = all_lines[-lines:]
    except FileNotFoundError:
        return {"error": "Audit log not accessible"}
    
    entries = []
    for line in recent_lines:
        entry = parse_pgaudit_log_line(line.strip())
        if entry:
            entries.append(entry.dict())
    
    return {
        "parsed_entries": entries,
        "total_raw_lines": len(recent_lines),
        "parsed_count": len(entries)
    }
```

**Limitations:**
- Log-based (not structured queryable storage)
- Requires log parsing for analysis
- No built-in user-friendly query interface
- Can generate massive log volumes
- Object-level auditing requires explicit configuration per table
- Session-level logging can be noisy
- Log file management required (rotation, retention)

---

## Audit Logging Comparison

| Feature | FastAPI Middleware | PostgreSQL Triggers | TimescaleDB | PgAudit |
|---------|-------------------|---------------------|-------------|---------|
| **License** | Custom | PostgreSQL | Apache 2.0 | PostgreSQL |
| **Granularity** | Request-level | Row-level | Time-series | Statement-level |
| **Performance** | Good (async) | Latency on writes | Good (chunked) | Log overhead |
| **Queryability** | SQL (app table) | SQL (audit table) | SQL + aggregates | Log parsing |
| **Tamper-proof** | HMAC signatures | No | No | No |
| **Retention** | Custom logic | Partitioning | Auto (policies) | Log rotation |
| **Context** | Full HTTP | DB session only | Full HTTP | DB only |
| **Change diff** | Yes | Yes | Limited | No |
| **Setup** | Code | SQL triggers | Extension | Extension |
| **DeepSynaps Fit** | **Excellent** | Good | **Excellent** | Supplemental |

---

## 7. Data Export

### 7.1 pandas (BSD-3-Clause)

| Attribute | Detail |
|-----------|--------|
| **Name** | pandas |
| **Language** | Python/C |
| **License** | BSD-3-Clause |
| **GitHub URL** | https://github.com/pandas-dev/pandas |
| **Stars** | 46,000+ |
| **Website** | https://pandas.pydata.org |

**Key Features:**
- Powerful data manipulation and analysis library
- DataFrame structure for tabular data
- Export to CSV, Excel (XLSX), JSON, Parquet, Feather, HDF5, SQL, HTML
- Data cleaning and transformation
- GroupBy operations for aggregation
- Merge/join capabilities
- Time series functionality
- Memory-efficient operations
- Integration with NumPy, Matplotlib, and the Python data ecosystem

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Data export with pandas
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, text
import pandas as pd
from io import BytesIO, StringIO
import tempfile
import os
from datetime import datetime
from typing import Optional, List

class ExportRequest(BaseModel):
    entity_type: str  # contacts, deals, organizations, activities
    format: str = "csv"  # csv, xlsx, json, parquet
    columns: Optional[List[str]] = None
    filters: Optional[dict] = None
    include_related: bool = False

@app.post("/api/v1/export")
async def export_data(
    request: ExportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generic data export endpoint supporting multiple formats.
    """
    # Build query based on entity type
    query = build_export_query(request.entity_type, request.filters, current_user)
    
    # Execute and load into DataFrame
    result = db.execute(query)
    df = pd.DataFrame(result.fetchall(), columns=result.keys())
    
    # Apply column selection
    if request.columns:
        available_cols = [c for c in request.columns if c in df.columns]
        df = df[available_cols]
    
    # Apply data transformations
    df = transform_export_data(df, request.entity_type)
    
    # Generate export file
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"deepsynaps_{request.entity_type}_{timestamp}"
    
    if request.format == "csv":
        return export_csv(df, filename)
    elif request.format == "xlsx":
        return export_excel(df, filename)
    elif request.format == "json":
        return export_json(df, filename)
    elif request.format == "parquet":
        return export_parquet(df, filename)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {request.format}")

def build_export_query(entity_type: str, filters: dict, user: User):
    """Build SQL query for export based on entity type"""
    
    base_queries = {
        "contacts": """
            SELECT 
                c.id, c.first_name, c.last_name, c.email, c.phone, c.title,
                c.status, c.score, c.notes, c.created_at, c.updated_at,
                o.name as organization_name,
                u.first_name || ' ' || u.last_name as owner_name
            FROM contacts c
            LEFT JOIN organizations o ON c.organization_id = o.id
            LEFT JOIN users u ON c.owner_id = u.id
            WHERE c.organization_id = :org_id
        """,
        "deals": """
            SELECT 
                d.id, d.title, d.description, d.value, d.currency, d.stage,
                d.probability, d.expected_close_date, d.actual_close_date, d.source,
                d.created_at, d.updated_at,
                c.first_name || ' ' || c.last_name as contact_name,
                c.email as contact_email,
                o.name as organization_name,
                u.first_name || ' ' || u.last_name as owner_name
            FROM deals d
            LEFT JOIN contacts c ON d.contact_id = c.id
            LEFT JOIN organizations o ON d.organization_id = o.id
            LEFT JOIN users u ON d.owner_id = u.id
            WHERE d.organization_id = :org_id
        """,
        "activities": """
            SELECT 
                a.id, a.type, a.description, a.created_at,
                c.first_name || ' ' || c.last_name as contact_name,
                d.title as deal_title,
                u.first_name || ' ' || u.last_name as created_by_name
            FROM activities a
            LEFT JOIN contacts c ON a.contact_id = c.id
            LEFT JOIN deals d ON a.deal_id = d.id
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.organization_id = :org_id
        """
    }
    
    query = text(base_queries.get(entity_type, base_queries["contacts"]))
    return query.bindparams(org_id=user.organization_id)

def transform_export_data(df: pd.DataFrame, entity_type: str) -> pd.DataFrame:
    """Apply entity-specific transformations"""
    
    # Format dates
    date_columns = [col for col in df.columns if 'date' in col.lower() or '_at' in col]
    for col in date_columns:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col]).dt.strftime('%Y-%m-%d %H:%M:%S')
    
    # Format currency for deals
    if entity_type == "deals" and "value" in df.columns:
        df["value"] = df["value"].apply(lambda x: f"${x:,.2f}" if pd.notna(x) else "")
    
    # Clean text fields
    if "notes" in df.columns:
        df["notes"] = df["notes"].str.replace('\r\n', ' ').str.replace('\n', ' ')
    
    if "description" in df.columns:
        df["description"] = df["description"].str.replace('\r\n', ' ').str.replace('\n', ' ')
    
    return df

def export_csv(df: pd.DataFrame, filename: str):
    """Export as CSV with streaming"""
    stream = StringIO()
    df.to_csv(stream, index=False, encoding='utf-8-sig')  # BOM for Excel compatibility
    stream.seek(0)
    
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
    )

def export_excel(df: pd.DataFrame, filename: str):
    """Export as formatted Excel with multiple sheets"""
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Data', index=False)
        
        # Add summary sheet
        summary = pd.DataFrame({
            'Metric': ['Total Records', 'Export Date', 'Generated By'],
            'Value': [len(df), datetime.utcnow().isoformat(), 'DeepSynaps CRM']
        })
        summary.to_excel(writer, sheet_name='Summary', index=False)
        
        # Auto-adjust column widths
        worksheet = writer.sheets['Data']
        for column in worksheet.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            worksheet.column_dimensions[column_letter].width = adjusted_width
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"}
    )

def export_json(df: pd.DataFrame, filename: str):
    """Export as JSON"""
    output = BytesIO()
    df.to_json(output, orient='records', date_format='iso')
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}.json"}
    )

def export_parquet(df: pd.DataFrame, filename: str):
    """Export as Apache Parquet (columnar format)"""
    output = BytesIO()
    df.to_parquet(output, index=False, compression='snappy')
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}.parquet"}
    )

# Scheduled bulk export for backups
@app.post("/api/v1/export/scheduled")
async def schedule_export(
    entity_type: str,
    frequency: str = "daily",  # daily, weekly, monthly
    format: str = "parquet",
    destination: str = "s3",  # s3, gcs, azure
    current_user: User = Depends(require_admin)
):
    """
    Schedule recurring data exports.
    Implementation would integrate with Celery/APScheduler.
    """
    from celery import Celery
    
    celery_app = Celery('deepsynaps')
    
    @celery_app.task
    def bulk_export_task():
        db = next(get_db())
        query = build_export_query(entity_type, None, current_user)
        result = db.execute(query)
        df = pd.DataFrame(result.fetchall(), columns=result.keys())
        
        # Upload to cloud storage
        timestamp = datetime.utcnow().strftime("%Y/%m/%d")
        path = f"exports/{current_user.organization_id}/{entity_type}/{timestamp}/{uuid.uuid4()}.parquet"
        
        if destination == "s3":
            import boto3
            s3 = boto3.client('s3')
            buffer = BytesIO()
            df.to_parquet(buffer, index=False)
            s3.put_object(
                Bucket='deepsynaps-exports',
                Key=path,
                Body=buffer.getvalue()
            )
        
        return {"exported_rows": len(df), "path": path}
    
    # Schedule the task
    schedule_map = {
        "daily": "0 2 * * *",     # 2 AM daily
        "weekly": "0 2 * * 0",    # 2 AM Sunday
        "monthly": "0 2 1 * *"    # 2 AM 1st of month
    }
    
    celery_app.conf.beat_schedule = {
        f'export-{entity_type}': {
            'task': 'bulk_export_task',
            'schedule': celery.schedules.crontab(**parse_crontab(schedule_map[frequency]))
        }
    }
    
    return {
        "scheduled": True,
        "entity_type": entity_type,
        "frequency": frequency,
        "destination": destination,
        "next_run": calculate_next_run(frequency)
    }

# Large dataset streaming export (memory-efficient)
@app.get("/api/v1/export/streaming/{entity_type}")
async def streaming_export(
    entity_type: str,
    chunk_size: int = 10000,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Memory-efficient streaming export for large datasets.
    Uses server-side cursor to avoid loading entire table into memory.
    """
    from sqlalchemy.orm import Session
    import csv
    import io
    
    def generate_csv_chunks():
        """Generator that yields CSV chunks from database cursor"""
        conn = db.connection().execution_options(stream_results=True)
        
        query = build_export_query(entity_type, None, current_user)
        result = conn.execute(query)
        
        # Write headers
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(result.keys())
        yield buffer.getvalue()
        
        # Write rows in chunks
        chunk = []
        for row in result:
            chunk.append([str(cell) if cell is not None else "" for cell in row])
            if len(chunk) >= chunk_size:
                buffer = io.StringIO()
                writer = csv.writer(buffer)
                writer.writerows(chunk)
                yield buffer.getvalue()
                chunk = []
        
        # Yield remaining rows
        if chunk:
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerows(chunk)
            yield buffer.getvalue()
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"deepsynaps_{entity_type}_{timestamp}.csv"
    
    return StreamingResponse(
        generate_csv_chunks(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
```

**Limitations:**
- Memory usage for very large DataFrames (mitigated by chunking)
- Excel export requires openpyxl (additional dependency)
- Not thread-safe for concurrent writes to same file
- Parquet requires pyarrow or fastparquet
- Limited formatting control in Excel output

---

### 7.2 WeasyPrint (BSD-3-Clause)

| Attribute | Detail |
|-----------|--------|
| **Name** | WeasyPrint |
| **Language** | Python |
| **License** | BSD-3-Clause |
| **GitHub URL** | https://github.com/Kozea/WeasyPrint |
| **Stars** | 7,300+ |
| **Website** | https://weasyprint.org |

**Key Features:**
- HTML/CSS to PDF conversion
- Full CSS3 support (better than most PDF libraries)
- SVG and image embedding
- Table support with repeating headers
- Page breaks, margins, headers/footers
- Font embedding
- Bookmarks and hyperlinks
- Forms (basic)
- Running headers/footers with @page rules
- CMYK color support
- Multi-page document generation

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: PDF generation with WeasyPrint
from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration
from jinja2 import Template
from sqlalchemy.orm import Session
from io import BytesIO
from datetime import datetime

# PDF Templates (Jinja2 + CSS)
CONTACT_REPORT_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: A4;
            margin: 2cm;
            @top-center { content: "DeepSynaps CRM - Contact Report"; font-size: 9pt; color: #666; }
            @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; }
        }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2c3e50; margin-bottom: 5px; }
        .header .meta { color: #7f8c8d; font-size: 10pt; }
        .summary { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .summary-grid { display: table; width: 100%; }
        .summary-item { display: table-cell; text-align: center; padding: 10px; }
        .summary-value { font-size: 24pt; font-weight: bold; color: #3498db; }
        .summary-label { font-size: 9pt; color: #7f8c8d; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #2c3e50; color: white; padding: 10px; text-align: left; font-size: 9pt; }
        td { padding: 8px 10px; border-bottom: 1px solid #ecf0f1; font-size: 9pt; }
        tr:nth-child(even) { background: #f8f9fa; }
        .status-badge { padding: 2px 8px; border-radius: 12px; font-size: 8pt; font-weight: bold; }
        .status-lead { background: #fff3cd; color: #856404; }
        .status-qualified { background: #d4edda; color: #155724; }
        .status-customer { background: #cce5ff; color: #004085; }
        .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ecf0f1; font-size: 8pt; color: #7f8c8d; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Contact Report</h1>
        <div class="meta">Generated on {{ generated_at }} | Organization: {{ org_name }}</div>
    </div>
    
    <div class="summary">
        <div class="summary-grid">
            <div class="summary-item">
                <div class="summary-value">{{ total_contacts }}</div>
                <div class="summary-label">Total Contacts</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">{{ leads_count }}</div>
                <div class="summary-label">Leads</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">{{ qualified_count }}</div>
                <div class="summary-label">Qualified</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">{{ customer_count }}</div>
                <div class="summary-label">Customers</div>
            </div>
            <div class="summary-item">
                <div class="summary-value">${"{:,.0f}".format(avg_score)}</div>
                <div class="summary-label">Avg Score</div>
            </div>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Organization</th>
                <th>Status</th>
                <th>Score</th>
                <th>Created</th>
            </tr>
        </thead>
        <tbody>
            {% for contact in contacts %}
            <tr>
                <td>{{ contact.first_name }} {{ contact.last_name }}</td>
                <td>{{ contact.email }}</td>
                <td>{{ contact.phone or '-' }}</td>
                <td>{{ contact.organization_name or '-' }}</td>
                <td>
                    <span class="status-badge status-{{ contact.status }}">
                        {{ contact.status.title() }}
                    </span>
                </td>
                <td>{{ contact.score }}</td>
                <td>{{ contact.created_at.strftime('%Y-%m-%d') }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>
    
    <div class="footer">
        Confidential - DeepSynaps CRM Report | Page generated automatically
    </div>
</body>
</html>
"""

DEAL_PIPELINE_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: A4 landscape;
            margin: 1.5cm;
            @top-center { content: "DeepSynaps - Pipeline Report"; font-size: 9pt; }
        }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; }
        .pipeline-container { display: table; width: 100%; margin-top: 20px; }
        .pipeline-stage { 
            display: table-cell; 
            width: 16.66%; 
            padding: 10px; 
            vertical-align: top;
            border-right: 2px dashed #ecf0f1;
        }
        .pipeline-stage:last-child { border-right: none; }
        .stage-header { 
            background: #2c3e50; 
            color: white; 
            padding: 10px; 
            text-align: center;
            font-weight: bold; 
            border-radius: 5px 5px 0 0;
        }
        .stage-stats { 
            background: #ecf0f1; 
            padding: 8px; 
            text-align: center; 
            font-size: 8pt; 
        }
        .deal-card { 
            background: #f8f9fa; 
            border: 1px solid #dee2e6; 
            border-radius: 4px; 
            padding: 8px; 
            margin-top: 8px;
            font-size: 8pt;
        }
        .deal-title { font-weight: bold; color: #2c3e50; }
        .deal-value { color: #27ae60; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Sales Pipeline Report</h1>
    <p>Generated: {{ generated_at }} | Total Pipeline Value: ${{ "{:,.2f}".format(total_pipeline_value) }}</p>
    
    <div class="pipeline-container">
        {% for stage, deals in pipeline.items() %}
        <div class="pipeline-stage">
            <div class="stage-header">{{ stage.title() }}</div>
            <div class="stage-stats">
                {{ deals|length }} deals | ${{ "{:,.0f}".format(deals|sum(attribute='value')) }}
            </div>
            {% for deal in deals %}
            <div class="deal-card">
                <div class="deal-title">{{ deal.title }}</div>
                <div class="deal-value">${{ "{:,.0f}".format(deal.value) }}</div>
                <div>{{ deal.contact_name }} | {{ deal.probability }}% prob</div>
            </div>
            {% endfor %}
        </div>
        {% endfor %}
    </div>
</body>
</html>
"""

@app.get("/api/v1/export/pdf/contacts")
async def export_contacts_pdf(
    status: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate PDF contact report"""
    
    # Fetch contacts
    query = db.query(Contact).filter(Contact.organization_id == current_user.organization_id)
    if status:
        query = query.filter(Contact.status == status)
    
    contacts = query.all()
    
    # Calculate statistics
    total = len(contacts)
    leads = sum(1 for c in contacts if c.status == "lead")
    qualified = sum(1 for c in contacts if c.status == "qualified")
    customers = sum(1 for c in contacts if c.status == "customer")
    avg_score = sum(c.score for c in contacts) / total if total > 0 else 0
    
    # Prepare template data
    template = Template(CONTACT_REPORT_TEMPLATE)
    html_content = template.render(
        contacts=contacts,
        total_contacts=total,
        leads_count=leads,
        qualified_count=qualified,
        customer_count=customers,
        avg_score=avg_score,
        org_name=current_user.organization.name,
        generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    )
    
    # Generate PDF
    font_config = FontConfiguration()
    html = HTML(string=html_content)
    pdf_buffer = BytesIO()
    html.write_pdf(pdf_buffer, font_config=font_config)
    pdf_buffer.seek(0)
    
    filename = f"contacts_report_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/v1/export/pdf/pipeline")
async def export_pipeline_pdf(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate visual pipeline report as PDF"""
    
    stages = ["prospecting", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"]
    pipeline = {stage: [] for stage in stages}
    
    deals = db.query(Deal).filter(
        Deal.organization_id == current_user.organization_id,
        Deal.stage.in_(stages)
    ).all()
    
    for deal in deals:
        if deal.stage in pipeline:
            pipeline[deal.stage].append({
                "title": deal.title,
                "value": deal.value,
                "contact_name": deal.contact.first_name + " " + deal.contact.last_name if deal.contact else "",
                "probability": deal.probability
            })
    
    total_value = sum(d.value for d in deals)
    
    template = Template(DEAL_PIPELINE_TEMPLATE)
    html_content = template.render(
        pipeline=pipeline,
        total_pipeline_value=total_value,
        generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    )
    
    font_config = FontConfiguration()
    html = HTML(string=html_content)
    pdf_buffer = BytesIO()
    html.write_pdf(pdf_buffer, font_config=font_config)
    pdf_buffer.seek(0)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=pipeline_{datetime.utcnow().strftime('%Y%m%d')}.pdf"}
    )

@app.post("/api/v1/export/pdf/invoice")
async def generate_invoice_pdf(
    invoice_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate branded invoice PDF"""
    
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404)
    
    template_str = """
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @page { size: A4; margin: 2cm; }
            body { font-family: Arial, sans-serif; }
            .invoice-header { border-bottom: 3px solid #2c3e50; padding-bottom: 20px; }
            .company-info { float: left; }
            .invoice-info { float: right; text-align: right; }
            .clear { clear: both; }
            .items-table { width: 100%; margin-top: 30px; border-collapse: collapse; }
            .items-table th { background: #2c3e50; color: white; padding: 10px; }
            .items-table td { padding: 10px; border-bottom: 1px solid #ddd; }
            .total-section { margin-top: 20px; text-align: right; }
            .total-amount { font-size: 18pt; font-weight: bold; color: #2c3e50; }
        </style>
    </head>
    <body>
        <div class="invoice-header">
            <div class="company-info">
                <h2>{{ company_name }}</h2>
                <p>{{ company_address }}</p>
            </div>
            <div class="invoice-info">
                <h1>INVOICE</h1>
                <p>Invoice #: {{ invoice.number }}</p>
                <p>Date: {{ invoice.date }}</p>
                <p>Due: {{ invoice.due_date }}</p>
            </div>
            <div class="clear"></div>
        </div>
        
        <div class="bill-to">
            <h3>Bill To:</h3>
            <p>{{ customer.name }}</p>
            <p>{{ customer.email }}</p>
        </div>
        
        <table class="items-table">
            <thead>
                <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
                {% for item in invoice.items %}
                <tr>
                    <td>{{ item.description }}</td>
                    <td>{{ item.quantity }}</td>
                    <td>${{ "{:.2f}".format(item.rate) }}</td>
                    <td>${{ "{:.2f}".format(item.amount) }}</td>
                </tr>
                {% endfor %}
            </tbody>
        </table>
        
        <div class="total-section">
            <p>Subtotal: ${{ "{:.2f}".format(invoice.subtotal) }}</p>
            <p>Tax ({{ invoice.tax_rate }}%): ${{ "{:.2f}".format(invoice.tax) }}</p>
            <p class="total-amount">Total: ${{ "{:.2f}".format(invoice.total) }}</p>
        </div>
    </body>
    </html>
    """
    
    template = Template(template_str)
    html_content = template.render(invoice=invoice, company_name="DeepSynaps Inc.")
    
    html = HTML(string=html_content)
    pdf = BytesIO()
    html.write_pdf(pdf)
    pdf.seek(0)
    
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{invoice.number}.pdf"}
    )
```

**Limitations:**
- Requires system dependencies (Cairo, Pango, GDK-PixBuf)
- Complex layouts can be challenging
- Slow for very large documents
- JavaScript not supported in HTML
- Memory usage scales with document complexity
- Font handling can be tricky across platforms

---

### 7.3 Apache Arrow

| Attribute | Detail |
|-----------|--------|
| **Name** | Apache Arrow |
| **Language** | C++ (multiple language bindings) |
| **License** | Apache 2.0 |
| **GitHub URL** | https://github.com/apache/arrow |
| **Stars** | 14,500+ |
| **Website** | https://arrow.apache.org |

**Key Features:**
- Columnar in-memory format for efficient analytics
- Zero-copy data sharing between processes
- Language-agnostic standard (C++, Python, Java, Go, Rust, JavaScript)
- Integration with pandas (PyArrow), Spark, Dask
- Parquet file format integration
- Flight protocol for high-performance data transport
- IPC format for efficient serialization
- SIMD-optimized operations
- Dictionary encoding for categorical data
- Nested data type support

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Apache Arrow for high-performance data export
from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.csv as pacsv
import pyarrow.ipc as ipc
from io import BytesIO
from datetime import datetime

@app.get("/api/v1/export/arrow/{entity_type}")
async def export_arrow_stream(
    entity_type: str,
    format: str = "arrow",  # arrow, parquet, csv
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Export data using Apache Arrow for maximum performance.
    Arrow IPC format enables zero-copy transfer to analytics tools.
    """
    # Fetch data efficiently
    query = text(f"""
        SELECT * FROM {entity_type}
        WHERE organization_id = :org_id
        LIMIT 100000
    """).bindparams(org_id=current_user.organization_id)
    
    result = db.execute(query)
    rows = result.fetchall()
    columns = result.keys()
    
    # Convert to Arrow Table (columnar format)
    columnar_data = {}
    for i, col_name in enumerate(columns):
        values = [row[i] for row in rows]
        
        # Infer Arrow type
        arrow_type = infer_arrow_type(values)
        columnar_data[col_name] = pa.array(values, type=arrow_type)
    
    table = pa.table(columnar_data)
    
    # Export in requested format
    if format == "arrow":
        # Arrow IPC streaming format (fastest for Arrow consumers)
        sink = BytesIO()
        with ipc.new_stream(sink, table.schema) as writer:
            writer.write_table(table)
        sink.seek(0)
        
        return StreamingResponse(
            sink,
            media_type="application/vnd.apache.arrow.stream",
            headers={"Content-Disposition": f"attachment; filename={entity_type}.arrow"}
        )
    
    elif format == "parquet":
        # Columnar Parquet with Snappy compression
        sink = BytesIO()
        pq.write_table(table, sink, compression='snappy')
        sink.seek(0)
        
        return StreamingResponse(
            sink,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={entity_type}.parquet"}
        )
    
    elif format == "csv":
        # Arrow-optimized CSV export
        sink = BytesIO()
        pacsv.write_csv(table, sink)
        sink.seek(0)
        
        return StreamingResponse(
            sink,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={entity_type}.csv"}
        )

def infer_arrow_type(values):
    """Infer appropriate Arrow type from Python values"""
    if not values:
        return pa.string()
    
    sample = values[0]
    
    if isinstance(sample, bool):
        return pa.bool_()
    elif isinstance(sample, int):
        return pa.int64()
    elif isinstance(sample, float):
        return pa.float64()
    elif isinstance(sample, datetime):
        return pa.timestamp('us')
    else:
        return pa.string()

# Arrow Flight server for real-time data access
from pyarrow import flight

class DeepSynapsFlightServer(flight.FlightServerBase):
    """
    Arrow Flight server for high-performance data access.
    Enables direct Arrow data transfer to clients without serialization overhead.
    """
    
    def __init__(self, location="grpc://0.0.0.0:8815", db_session_factory=None, **kwargs):
        super().__init__(location, **kwargs)
        self.db_session_factory = db_session_factory
    
    def do_get(self, context, ticket):
        """Handle data retrieval requests"""
        import json
        request = json.loads(ticket.ticket.decode())
        
        entity_type = request.get("entity_type")
        org_id = request.get("organization_id")
        
        db = self.db_session_factory()
        
        query = text(f"SELECT * FROM {entity_type} WHERE organization_id = :org_id")
        result = db.execute(query.bindparams(org_id=org_id))
        
        # Convert to Arrow record batch stream
        columns = result.keys()
        rows = result.fetchall()
        
        arrays = []
        for i, col in enumerate(columns):
            values = [row[i] for row in rows]
            arrays.append(pa.array(values))
        
        table = pa.table(dict(zip(columns, arrays)))
        
        return flight.RecordBatchStream(table)
    
    def get_flight_info(self, context, descriptor):
        """Describe available datasets"""
        import json
        command = json.loads(descriptor.command)
        
        dataset = command.get("dataset")
        
        # Return schema info
        endpoint = flight.FlightEndpoint(
            ticket=descriptor.command,
            locations=[flight.Location.for_grpc_tcp("localhost", 8815)]
        )
        
        return flight.FlightInfo(
            schema=pa.schema([("id", pa.int64()), ("name", pa.string())]),
            descriptor=descriptor,
            endpoints=[endpoint],
            total_records=-1,
            total_bytes=-1
        )

# Usage: client reads data directly as Arrow table
"""
import pyarrow.flight as flight

client = flight.connect("grpc://localhost:8815")
ticket = flight.Ticket(json.dumps({
    "entity_type": "contacts",
    "organization_id": 123
}).encode())

reader = client.do_get(ticket)
table = reader.read_all()  # Arrow Table - zero copy in same process

df = table.to_pandas()  # Convert to pandas if needed
"""
```

**Limitations:**
- Additional dependency (PyArrow can be large)
- Arrow Flight requires gRPC
- Learning curve for Arrow ecosystem
- SQLAlchemy results need manual conversion
- Less mature Python ecosystem than pandas for some operations

---

## Data Export Tools Comparison

| Feature | pandas | WeasyPrint | Apache Arrow |
|---------|--------|------------|--------------|
| **License** | BSD-3 | BSD-3 | Apache 2.0 |
| **Language** | Python/C | Python | C++ |
| **Primary Use** | CSV/Excel | PDF | Columnar data |
| **Performance** | Good | Medium | Excellent |
| **Memory** | Moderate | High | Low (zero-copy) |
| **Streaming** | Yes | No | Yes |
| **Format Support** | CSV/XLSX/JSON/Parquet | PDF | Arrow/Parquet/IPC |
| **Templating** | No | HTML/Jinja2 | No |
| **Dependencies** | Lightweight | Cairo/Pango | PyArrow |
| **DeepSynaps Fit** | **Excellent** | **Excellent** | Analytics |

---

## 8. Billing Integration

### 8.1 Stripe Python SDK (MIT)

| Attribute | Detail |
|-----------|--------|
| **Name** | Stripe Python SDK |
| **Language** | Python |
| **License** | MIT |
| **GitHub URL** | https://github.com/stripe/stripe-python |
| **Stars** | 1,300+ |
| **Website** | https://stripe.com/docs/api |

**Key Features:**
- Complete Python bindings for Stripe REST API
- Payment processing (cards, bank transfers, digital wallets)
- Subscription management with billing cycles
- Customer portal for self-service billing
- Invoice generation and sending
- Usage-based billing (metered pricing)
- Trial management
- Coupon and promotion codes
- Tax calculation (Stripe Tax)
- Multi-party payments (Connect)
- Webhook signature verification
- Idempotency key support
- Strong typing with Pydantic models (stripe-python v9+)

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Stripe billing integration
from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime, Numeric, JSON, ForeignKey
import stripe
from datetime import datetime, timedelta
from pydantic import BaseModel
import json

# Stripe configuration
stripe.api_key = "sk_test_..."  # Use environment variable in production
STRIPE_WEBHOOK_SECRET = "whsec_..."
STRIPE_PUBLISHABLE_KEY = "pk_test_..."

# Billing models
class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"
    
    id = Column(Integer, primary_key=True)
    stripe_price_id = Column(String(100), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    tier = Column(String(20), nullable=False)  # free, starter, professional, enterprise
    monthly_price_cents = Column(Integer, nullable=False)
    yearly_price_cents = Column(Integer)
    features = Column(JSON)  # [{"name": "Contacts", "limit": 1000}, ...]
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

class OrganizationBilling(Base):
    __tablename__ = "organization_billing"
    
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), unique=True)
    stripe_customer_id = Column(String(100), unique=True)
    stripe_subscription_id = Column(String(100))
    current_plan_id = Column(Integer, ForeignKey("subscription_plans.id"))
    billing_email = Column(String(255))
    billing_cycle = Column(String(20), default="monthly")  # monthly, yearly
    trial_ends_at = Column(DateTime)
    current_period_start = Column(DateTime)
    current_period_end = Column(DateTime)
    cancel_at_period_end = Column(Boolean, default=False)
    usage_limits = Column(JSON)  # Current plan limits
    usage_current = Column(JSON)  # Current period usage
    payment_method_id = Column(String(100))
    invoice_settings = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

class UsageRecord(Base):
    __tablename__ = "usage_records"
    
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    stripe_subscription_item_id = Column(String(100))
    metric_name = Column(String(50))  # contacts, deals, api_calls, storage
    quantity = Column(Integer)
    timestamp = Column(DateTime, server_default=func.now())

# Pydantic schemas
class CreateCustomerRequest(BaseModel):
    organization_id: int
    email: str
    name: str
    billing_address: dict = None
    tax_id: str = None

class CreateSubscriptionRequest(BaseModel):
    organization_id: int
    plan_id: int
    billing_cycle: str = "monthly"  # monthly, yearly
    payment_method_id: str = None
    trial_days: int = 14
    coupon_code: str = None

class UpdateSubscriptionRequest(BaseModel):
    new_plan_id: int
    proration_behavior: str = "create_prorations"  # always_invoice, none

@app.post("/api/v1/billing/customers")
async def create_stripe_customer(
    request: CreateCustomerRequest,
    db: Session = Depends(get_db)
):
    """Create Stripe customer for an organization"""
    
    # Check if customer already exists
    existing = db.query(OrganizationBilling).filter(
        OrganizationBilling.organization_id == request.organization_id
    ).first()
    
    if existing and existing.stripe_customer_id:
        return {"customer_id": existing.stripe_customer_id, "status": "existing"}
    
    # Create Stripe customer
    customer = stripe.Customer.create(
        email=request.email,
        name=request.name,
        address=request.billing_address,
        tax_id_data=[{"type": "eu_vat", "value": request.tax_id}] if request.tax_id else None,
        metadata={
            "organization_id": str(request.organization_id),
            "platform": "deepsynaps"
        }
    )
    
    # Store in database
    if not existing:
        billing = OrganizationBilling(
            organization_id=request.organization_id,
            stripe_customer_id=customer.id,
            billing_email=request.email
        )
        db.add(billing)
    else:
        existing.stripe_customer_id = customer.id
        existing.billing_email = request.email
    
    db.commit()
    
    return {
        "customer_id": customer.id,
        "status": "created",
        "portal_url": f"/api/v1/billing/portal/{request.organization_id}"
    }

@app.post("/api/v1/billing/subscriptions")
async def create_subscription(
    request: CreateSubscriptionRequest,
    db: Session = Depends(get_db)
):
    """Create subscription for organization"""
    
    # Get plan details
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == request.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Get organization billing info
    billing = db.query(OrganizationBilling).filter(
        OrganizationBilling.organization_id == request.organization_id
    ).first()
    
    if not billing or not billing.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Customer not created. Call /billing/customers first.")
    
    # Select price based on billing cycle
    price_id = plan.stripe_price_id if request.billing_cycle == "monthly" else (
        plan.stripe_price_id_yearly or plan.stripe_price_id
    )
    
    # Build subscription parameters
    sub_params = {
        "customer": billing.stripe_customer_id,
        "items": [{"price": price_id}],
        "trial_period_days": request.trial_days if request.trial_days > 0 else None,
        "metadata": {
            "organization_id": str(request.organization_id),
            "plan_tier": plan.tier
        },
        "payment_behavior": "default_incomplete",
        "expand": ["latest_invoice.payment_intent"]
    }
    
    # Attach payment method if provided
    if request.payment_method_id:
        stripe.PaymentMethod.attach(
            request.payment_method_id,
            customer=billing.stripe_customer_id
        )
        stripe.Customer.modify(
            billing.stripe_customer_id,
            invoice_settings={"default_payment_method": request.payment_method_id}
        )
        sub_params["default_payment_method"] = request.payment_method_id
        sub_params["payment_behavior"] = "allow_incomplete"
    
    # Apply coupon if provided
    if request.coupon_code:
        sub_params["coupon"] = request.coupon_code
    
    # Create subscription
    subscription = stripe.Subscription.create(**sub_params)
    
    # Update database
    billing.stripe_subscription_id = subscription.id
    billing.current_plan_id = plan.id
    billing.billing_cycle = request.billing_cycle
    billing.current_period_start = datetime.fromtimestamp(subscription.current_period_start)
    billing.current_period_end = datetime.fromtimestamp(subscription.current_period_end)
    billing.trial_ends_at = datetime.fromtimestamp(subscription.trial_end) if subscription.trial_end else None
    billing.cancel_at_period_end = subscription.cancel_at_period_end
    billing.usage_limits = plan.features
    
    db.commit()
    
    return {
        "subscription_id": subscription.id,
        "status": subscription.status,
        "trial_end": subscription.trial_end,
        "client_secret": subscription.latest_invoice.payment_intent.client_secret 
            if subscription.latest_invoice and subscription.latest_invoice.payment_intent 
            else None,
        "current_period_end": billing.current_period_end.isoformat()
    }

@app.post("/api/v1/billing/subscriptions/{subscription_id}/change-plan")
async def change_plan(
    subscription_id: str,
    request: UpdateSubscriptionRequest,
    db: Session = Depends(get_db)
):
    """Upgrade or downgrade subscription plan"""
    
    new_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == request.new_plan_id).first()
    if not new_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Retrieve current subscription
    subscription = stripe.Subscription.retrieve(subscription_id)
    
    # Update subscription with new price
    updated = stripe.Subscription.modify(
        subscription_id,
        items=[{
            "id": subscription["items"]["data"][0]["id"],
            "price": new_plan.stripe_price_id
        }],
        proration_behavior=request.proration_behavior,
        metadata={"plan_tier": new_plan.tier}
    )
    
    # Update database
    billing = db.query(OrganizationBilling).filter(
        OrganizationBilling.stripe_subscription_id == subscription_id
    ).first()
    
    if billing:
        billing.current_plan_id = new_plan.id
        billing.usage_limits = new_plan.features
        db.commit()
    
    return {
        "subscription_id": updated.id,
        "status": updated.status,
        "new_plan": new_plan.tier,
        "proration_date": datetime.fromtimestamp(updated.proration_date).isoformat() 
            if updated.proration_date else None
    }

@app.post("/api/v1/billing/subscriptions/{subscription_id}/cancel")
async def cancel_subscription(
    subscription_id: str,
    at_period_end: bool = True,
    db: Session = Depends(get_db)
):
    """Cancel subscription"""
    
    if at_period_end:
        subscription = stripe.Subscription.modify(
            subscription_id,
            cancel_at_period_end=True
        )
    else:
        subscription = stripe.Subscription.delete(subscription_id)
    
    # Update database
    billing = db.query(OrganizationBilling).filter(
        OrganizationBilling.stripe_subscription_id == subscription_id
    ).first()
    
    if billing:
        billing.cancel_at_period_end = at_period_end
        if not at_period_end:
            billing.stripe_subscription_id = None
            billing.current_plan_id = None
        db.commit()
    
    return {
        "subscription_id": subscription.id,
        "status": subscription.status,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "current_period_end": datetime.fromtimestamp(subscription.current_period_end).isoformat()
    }

@app.post("/api/v1/billing/usage")
async def report_usage(
    organization_id: int,
    metric_name: str,
    quantity: int,
    db: Session = Depends(get_db)
):
    """
    Report usage for metered billing.
    Called periodically or event-driven.
    """
    billing = db.query(OrganizationBilling).filter(
        OrganizationBilling.organization_id == organization_id
    ).first()
    
    if not billing or not billing.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription")
    
    # Get subscription item for metered price
    subscription = stripe.Subscription.retrieve(billing.stripe_subscription_id)
    
    # Find the subscription item for this metric (if metered)
    for item in subscription["items"]["data"]:
        if item["price"]["recurring"]["usage_type"] == "metered":
            # Create usage record
            stripe.UsageRecord.create(
                subscription_item=item["id"],
                quantity=quantity,
                timestamp=int(datetime.utcnow().timestamp()),
                action="set"  # or "increment"
            )
            
            # Store local record
            usage = UsageRecord(
                organization_id=organization_id,
                stripe_subscription_item_id=item["id"],
                metric_name=metric_name,
                quantity=quantity
            )
            db.add(usage)
            db.commit()
            
            return {"recorded": True, "quantity": quantity, "metric": metric_name}
    
    return {"recorded": False, "reason": "No metered price found"}

@app.get("/api/v1/billing/invoices")
async def list_invoices(
    organization_id: int,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """List invoices for organization"""
    
    billing = db.query(OrganizationBilling).filter(
        OrganizationBilling.organization_id == organization_id
    ).first()
    
    if not billing or not billing.stripe_customer_id:
        return {"invoices": []}
    
    invoices = stripe.Invoice.list(
        customer=billing.stripe_customer_id,
        limit=limit
    )
    
    return {
        "invoices": [
            {
                "id": inv.id,
                "number": inv.number,
                "status": inv.status,
                "amount_due": inv.amount_due,
                "amount_paid": inv.amount_paid,
                "currency": inv.currency,
                "created": datetime.fromtimestamp(inv.created).isoformat(),
                "pdf_url": inv.invoice_pdf,
                "hosted_invoice_url": inv.hosted_invoice_url,
                "lines": [
                    {
                        "description": line.description,
                        "amount": line.amount,
                        "period": {
                            "start": datetime.fromtimestamp(line.period.start).isoformat(),
                            "end": datetime.fromtimestamp(line.period.end).isoformat()
                        }
                    }
                    for line in inv.lines.data
                ]
            }
            for inv in invoices.data
        ]
    }

@app.get("/api/v1/billing/portal/{organization_id}")
async def customer_portal(organization_id: int, db: Session = Depends(get_db)):
    """Create customer portal session for self-service billing"""
    
    billing = db.query(OrganizationBilling).filter(
        OrganizationBilling.organization_id == organization_id
    ).first()
    
    if not billing or not billing.stripe_customer_id:
        raise HTTPException(status_code=404, detail="Billing not configured")
    
    session = stripe.billing_portal.Session.create(
        customer=billing.stripe_customer_id,
        return_url="https://app.deepsynaps.io/settings/billing",
        flow_data={
            "type": "payment_method_update"
        } if billing.payment_method_id else None
    )
    
    return {"portal_url": session.url}

# ---- Webhook handling ----

@app.post("/api/v1/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Handle Stripe webhooks for subscription lifecycle events.
    Configure in Stripe Dashboard: https://dashboard.stripe.com/webhooks
    Events to listen for:
    - customer.subscription.created
    - customer.subscription.updated
    - customer.subscription.deleted
    - invoice.payment_succeeded
    - invoice.payment_failed
    - customer.subscription.trial_will_end
    """
    
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    event_type = event["type"]
    data = event["data"]["object"]
    
    if event_type == "customer.subscription.updated":
        subscription = data
        org_id = int(subscription["metadata"].get("organization_id", 0))
        
        billing = db.query(OrganizationBilling).filter(
            OrganizationBilling.organization_id == org_id
        ).first()
        
        if billing:
            billing.current_period_start = datetime.fromtimestamp(subscription["current_period_start"])
            billing.current_period_end = datetime.fromtimestamp(subscription["current_period_end"])
            billing.status = subscription["status"]
            billing.cancel_at_period_end = subscription["cancel_at_period_end"]
            db.commit()
    
    elif event_type == "invoice.payment_succeeded":
        invoice = data
        # Log successful payment, send receipt
        await notification_service.send_payment_receipt(invoice)
    
    elif event_type == "invoice.payment_failed":
        invoice = data
        # Notify organization admins of payment failure
        await notification_service.send_payment_failed_alert(invoice)
    
    elif event_type == "customer.subscription.trial_will_end":
        subscription = data
        org_id = int(subscription["metadata"].get("organization_id", 0))
        # Send trial ending reminder
        await notification_service.send_trial_ending_reminder(
            org_id, 
            days_remaining=3
        )
    
    return {"status": "processed", "event": event_type}

@app.get("/api/v1/billing/plans")
async def list_plans(db: Session = Depends(get_db)):
    """List available subscription plans"""
    
    plans = db.query(SubscriptionPlan).filter(SubscriptionPlan.is_active == True).all()
    
    return {
        "plans": [
            {
                "id": plan.id,
                "name": plan.name,
                "tier": plan.tier,
                "description": plan.description,
                "monthly_price": plan.monthly_price_cents / 100,
                "yearly_price": plan.yearly_price_cents / 100 if plan.yearly_price_cents else None,
                "yearly_discount_percent": round(
                    (1 - plan.yearly_price_cents / (plan.monthly_price_cents * 12)) * 100
                ) if plan.yearly_price_cents else 0,
                "features": plan.features
            }
            for plan in plans
        ]
    }

# Plan seeder
PLANS = [
    {
        "stripe_price_id": "price_free",
        "name": "Free",
        "tier": "free",
        "monthly_price_cents": 0,
        "yearly_price_cents": 0,
        "features": {
            "contacts": {"limit": 100, "description": "Up to 100 contacts"},
            "deals": {"limit": 10, "description": "Up to 10 active deals"},
            "users": {"limit": 1, "description": "1 user"},
            "storage_mb": {"limit": 100, "description": "100 MB storage"},
            "api_calls": {"limit": 1000, "description": "1,000 API calls/month"},
            "support": {"value": "community", "description": "Community support"}
        }
    },
    {
        "stripe_price_id": "price_starter_monthly",
        "stripe_price_id_yearly": "price_starter_yearly",
        "name": "Starter",
        "tier": "starter",
        "monthly_price_cents": 2900,
        "yearly_price_cents": 29000,
        "features": {
            "contacts": {"limit": 1000, "description": "Up to 1,000 contacts"},
            "deals": {"limit": 100, "description": "Up to 100 active deals"},
            "users": {"limit": 5, "description": "Up to 5 users"},
            "storage_mb": {"limit": 1024, "description": "1 GB storage"},
            "api_calls": {"limit": 10000, "description": "10,000 API calls/month"},
            "support": {"value": "email", "description": "Email support"}
        }
    },
    {
        "stripe_price_id": "price_pro_monthly",
        "stripe_price_id_yearly": "price_pro_yearly",
        "name": "Professional",
        "tier": "professional",
        "monthly_price_cents": 9900,
        "yearly_price_cents": 99000,
        "features": {
            "contacts": {"limit": 10000, "description": "Up to 10,000 contacts"},
            "deals": {"limit": 1000, "description": "Up to 1,000 active deals"},
            "users": {"limit": 25, "description": "Up to 25 users"},
            "storage_mb": {"limit": 10240, "description": "10 GB storage"},
            "api_calls": {"limit": 100000, "description": "100,000 API calls/month"},
            "support": {"value": "priority", "description": "Priority support"},
            "advanced_features": ["automation", "reporting", "api_access", "custom_fields"]
        }
    },
    {
        "stripe_price_id": "price_enterprise_monthly",
        "name": "Enterprise",
        "tier": "enterprise",
        "monthly_price_cents": 0,  # Custom pricing
        "features": {
            "contacts": {"limit": -1, "description": "Unlimited contacts"},
            "deals": {"limit": -1, "description": "Unlimited deals"},
            "users": {"limit": -1, "description": "Unlimited users"},
            "storage_mb": {"limit": -1, "description": "Unlimited storage"},
            "api_calls": {"limit": -1, "description": "Unlimited API calls"},
            "support": {"value": "dedicated", "description": "Dedicated account manager"},
            "advanced_features": ["all_pro", "sso", "audit_logs", "sla", "custom_integration"]
        }
    }
]
```

**Limitations:**
- Transaction fees (2.9% + 30c per transaction)
- Requires PCI compliance considerations
- Webhook handling must be idempotent
- Rate limits on API calls
- Complex subscription state management
- International tax handling requires Stripe Tax (additional cost)

---

### 8.2 Chargebee (Proprietary with SDK)

| Attribute | Detail |
|-----------|--------|
| **Name** | Chargebee |
| **Language** | Python (SDK) |
| **License** | Proprietary (MIT SDK) |
| **GitHub URL** | https://github.com/chargebee/chargebee-python |
| **Stars** | ~200+ |
| **Website** | https://www.chargebee.com |

**Key Features:**
- Subscription management platform
- Recurring billing automation
- Trial management and freemium support
- Proration handling
- Tax management (Avalara, TaxJar integration)
- Dunning management (failed payment retry)
- Customer self-service portal
- Revenue recognition (ASC 606/IFRS 15)
- SaaS metrics (MRR, ARR, churn, LTV)
- Multiple payment gateway support
- Invoice consolidation
- Credit notes and refunds
- Coupons and promotional credits

**Integration Path with FastAPI + SQLAlchemy:**

```python
# FastAPI: Chargebee integration
import chargebee
from fastapi import HTTPException

CHARGEBEE_SITE = "deepsynaps-test"
CHARGEBEE_API_KEY = "test_..."

chargebee.configure(CHARGEBEE_API_KEY, CHARGEBEE_SITE)

@app.post("/api/v1/billing/chargebee/customers")
async def create_chargebee_customer(organization_id: int, email: str, name: str):
    """Create customer in Chargebee"""
    
    result = chargebee.Customer.create({
        "first_name": name.split()[0],
        "last_name": " ".join(name.split()[1:]) if len(name.split()) > 1 else "",
        "email": email,
        "meta_data": {"organization_id": str(organization_id)}
    })
    
    customer = result.customer
    
    return {
        "chargebee_customer_id": customer.id,
        "status": customer.status
    }

@app.post("/api/v1/billing/chargebee/subscriptions")
async def create_chargebee_subscription(
    customer_id: str,
    plan_id: str,
    billing_cycles: int = None,
    coupon_ids: list = None
):
    """Create subscription in Chargebee"""
    
    params = {
        "plan_id": plan_id,
        "customer_id": customer_id
    }
    
    if billing_cycles:
        params["billing_cycles"] = billing_cycles
    if coupon_ids:
        params["coupon_ids"] = coupon_ids
    
    result = chargebee.Subscription.create(params)
    
    return {
        "subscription_id": result.subscription.id,
        "status": result.subscription.status,
        "current_term_start": result.subscription.current_term_start,
        "current_term_end": result.subscription.current_term_end,
        "trial_end": result.subscription.trial_end
    }

@app.get("/api/v1/billing/chargebee/subscriptions/{subscription_id}")
async def get_chargebee_subscription(subscription_id: str):
    """Get subscription details from Chargebee"""
    
    result = chargebee.Subscription.retrieve(subscription_id)
    
    return {
        "id": result.subscription.id,
        "status": result.subscription.status,
        "plan_id": result.subscription.plan_id,
        "current_term_end": result.subscription.current_term_end,
        "cancel_at": result.subscription.cancel_at,
        "mrr": result.subscription.mrr if hasattr(result.subscription, 'mrr') else None
    }
```

**Limitations:**
- Proprietary service (not self-hostable)
- Monthly platform fee + transaction fees
- Vendor lock-in
- Less control over billing logic
- SDK less mature than Stripe's
- Limited customization of hosted pages
- Enterprise pricing for advanced features

---

### 8.3 Kill Bill (Apache 2.0)

| Attribute | Detail |
|-----------|--------|
| **Name** | Kill Bill |
| **Language** | Java |
| **License** | Apache 2.0 |
| **GitHub URL** | https://github.com/killbill/killbill |
| **Stars** | 2,300+ |
| **Website** | https://killbill.io |

**Key Features:**
- Open-source subscription billing platform
- Plugin architecture for payment gateways
- Complex billing scenarios (usage-based, tiered, volume)
- Account hierarchy support
- Dunning management
- Invoice generation and itemization
- Credit system
- Catalog management (plans, products, price lists)
- Overdue system with customizable policies
- Analytics plugin for SaaS metrics
- JAX-RS REST API
- Kaui: web UI for billing management
- Multi-tenancy support
- Audit logs for all operations

**Integration Path with FastAPI + SQLAlSQLAlchemy:**

```python
# FastAPI: Kill Bill integration
from fastapi import HTTPException
import requests
from requests.auth import HTTPBasicAuth

KILLBILL_URL = "http://killbill:8080"
KILLBILL_API_KEY = "bob"
KILLBILL_API_SECRET = "lazar"
KILLBILL_ADMIN = "admin"
KILLBILL_PASSWORD = "password"

class KillBillClient:
    def __init__(self):
        self.base_url = KILLBILL_URL
        self.auth = HTTPBasicAuth(KILLBILL_ADMIN, KILLBILL_PASSWORD)
        self.headers = {
            "X-Killbill-ApiKey": KILLBILL_API_KEY,
            "X-Killbill-ApiSecret": KILLBILL_API_SECRET,
            "Content-Type": "application/json"
        }
    
    def request(self, method: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/1.0/kb/{endpoint}"
        return requests.request(
            method, url, auth=self.auth, headers=self.headers, **kwargs
        )

kb = KillBillClient()

@app.post("/api/v1/billing/killbill/accounts")
async def create_killbill_account(
    organization_id: int,
    email: str,
    name: str,
    currency: str = "USD"
):
    """Create billing account in Kill Bill"""
    
    payload = {
        "name": name,
        "externalKey": f"deepsynaps-org-{organization_id}",
        "email": email,
        "currency": currency
    }
    
    response = kb.request("POST", "accounts", json=payload)
    
    if response.status_code == 201:
        account_id = response.headers.get("Location", "").split("/")[-1]
        return {
            "killbill_account_id": account_id,
            "external_key": payload["externalKey"]
        }
    
    raise HTTPException(status_code=response.status_code, detail=response.text)

@app.post("/api/v1/billing/killbill/subscriptions")
async def create_killbill_subscription(
    account_id: str,
    plan_name: str,
    product_category: str = "BASE"
):
    """Create subscription in Kill Bill"""
    
    payload = {
        "accountId": account_id,
        "planName": plan_name,
        "productCategory": product_category
    }
    
    response = kb.request("POST", "subscriptions", json=payload)
    
    if response.status_code == 201:
        subscription_id = response.headers.get("Location", "").split("/")[-1]
        return {
            "subscription_id": subscription_id,
            "status": "active"
        }
    
    raise HTTPException(status_code=response.status_code, detail=response.text)

@app.get("/api/v1/billing/killbill/invoices/{account_id}")
async def get_killbill_invoices(account_id: str):
    """Get invoices for account"""
    
    response = kb.request("GET", f"accounts/{account_id}/invoices")
    return response.json()

@app.get("/api/v1/billing/killbill/usage/{subscription_id}")
async def record_killbill_usage(
    subscription_id: str,
    unit_type: str,
    amount: int
):
    """Record usage for metered billing"""
    
    # Get current subscription to find bundle ID
    sub_response = kb.request("GET", f"subscriptions/{subscription_id}")
    subscription = sub_response.json()
    
    payload = {
        "subscriptionId": subscription_id,
        "unitUsageRecords": [{
            "unitType": unit_type,
            "usageRecords": [{
                "recordDate": datetime.utcnow().strftime("%Y-%m-%d"),
                "amount": amount
            }]
        }]
    }
    
    response = kb.request(
        "POST",
        f"subscriptions/{subscription_id}/usage",
        json=payload
    )
    
    return {"recorded": response.status_code == 201}

# Catalog upload (define plans)
CATALOG_XML = """
<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <effectiveDate>2024-01-01T00:00:00Z</effectiveDate>
    <catalogName>DeepSynaps</catalogName>
    
    <recurringBillingMode>IN_ADVANCE</recurringBillingMode>
    
    <products>
        <product name="CRM-Pro">
            <category>BASE</category>
        </product>
    </products>
    
    <plans>
        <plan name="starter-monthly">
            <product>CRM-Pro</product>
            <initialPhases>
                <phase type="TRIAL">
                    <duration>
                        <unit>DAYS</unit>
                        <number>14</number>
                    </duration>
                    <fixed>
                        <fixedPrice>
                            <price>
                                <currency>USD</currency>
                                <value>0</value>
                            </price>
                        </fixedPrice>
                    </fixed>
                </phase>
            </initialPhases>
            <finalPhase type="EVERGREEN">
                <recurring>
                    <billingPeriod>MONTHLY</billingPeriod>
                    <recurringPrice>
                        <price>
                            <currency>USD</currency>
                            <value>29.00</value>
                        </price>
                    </recurringPrice>
                </recurring>
            </finalPhase>
        </plan>
        
        <plan name="professional-monthly">
            <product>CRM-Pro</product>
            <finalPhase type="EVERGREEN">
                <recurring>
                    <billingPeriod>MONTHLY</billingPeriod>
                    <recurringPrice>
                        <price>
                            <currency>USD</currency>
                            <value>99.00</value>
                        </price>
                    </recurringPrice>
                </recurring>
            </finalPhase>
        </plan>
    </plans>
</catalog>
"""

@app.post("/api/v1/billing/killbill/catalog")
async def upload_killbill_catalog():
    """Upload catalog to Kill Bill"""
    response = kb.request(
        "POST",
        "security/roles",
        headers={"Content-Type": "application/xml"},
        data=CATALOG_XML
    )
    return {"uploaded": response.status_code == 201}
```

**Limitations:**
- Java-based; requires JVM infrastructure
- Complex catalog configuration (XML)
- Plugin development requires Java knowledge
- Smaller community than Stripe
- Kaui UI functional but not modern
- Documentation can be sparse
- Self-hosted deployment complexity
- Payment gateway plugins may lag behind official SDKs

---

## Billing Integration Comparison

| Feature | Stripe SDK | Chargebee | Kill Bill |
|---------|-----------|-----------|-----------|
| **License** | MIT | Proprietary (MIT SDK) | Apache 2.0 |
| **Hosting** | Cloud/SaaS | Cloud/SaaS | Self-hosted |
| **Setup** | Easy | Easy | Complex |
| **Subscription Mgmt** | Excellent | Excellent | Excellent |
| **Usage-based Billing** | Yes | Yes | Yes |
| **Payment Gateways** | Stripe only | Multiple | Multiple (plugins) |
| **Tax Handling** | Stripe Tax | Built-in/Avalara | Plugin |
| **Revenue Recognition** | Basic | Advanced | Plugin |
| **SaaS Metrics** | Basic | Built-in | Plugin |
| **Dunning** | Smart Retries | Advanced | Built-in |
| **Customer Portal** | Stripe-hosted | Chargebee-hosted | Kaui (self-hosted) |
| **Cost** | Transaction fees | Platform + fees | Free (infra only) |
| **DeepSynaps Fit** | **Excellent** | Moderate | Good (self-hosted) |

---

## 9. Integration Architecture

### 9.1 Recommended DeepSynaps CRM Architecture

```
+------------------------------------------------------------------+
|                         CLIENT LAYER                              |
|  +------------------+  +------------------+  +------------------+ |
|  |   React Admin    |  |     refine       |  |  Custom React    | |
|  |   (MIT)          |  |     (MIT)        |  |   Dashboard      | |
|  +------------------+  +------------------+  +------------------+ |
|         |                       |                       |         |
|         +-----------+-----------+-----------+-----------+         |
|                     |                       |                     |
|         +-----------v-----------+   +-------v-------+             |
|         |   Metabase Embed    |   |  Grafana      |             |
|         |   (AGPL)            |   |  (AGPL)       |             |
|         +---------------------+   +---------------+             |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                      API GATEWAY LAYER                            |
|  +----------------------------------------------------------+   |
|  |              FastAPI + Uvicorn (Python)                   |   |
|  |  - REST API endpoints                                     |   |
|  |  - GraphQL (optional: Strawberry)                         |   |
|  |  - WebSocket for real-time                                |   |
|  |  - Authentication (JWT + OAuth2)                          |   |
|  |  - Rate limiting (slowapi)                                |   |
|  |  - Request validation (Pydantic)                          |   |
|  +----------------------------------------------------------+   |
+------------------------------------------------------------------+
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
+------------------------------------------------------------------+
|                   SERVICE LAYER (Python)                          |
|  +----------------+  +----------------+  +------------------+    |
|  |  CRM Core      |  |  Analytics     |  |  Billing        |    |
|  |  Service       |  |  Service       |  |  Service        |    |
|  |                |  |                |  |                 |    |
|  | - Contacts     |  | - Metrics     |  | - Stripe SDK    |    |
|  | - Deals        |  | - Forecasting |  | - Subscription  |    |
|  | - Activities   |  | - Reporting   |  | - Invoicing     |    |
|  | - Tasks        |  | - Dashboards  |  | - Usage Meter   |    |
|  | - Notes        |  |               |  |                 |    |
|  +----------------+  +----------------+  +------------------+    |
|  +----------------+  +----------------+  +------------------+    |
|  |  Support       |  |  Export        |  |  Audit           |    |
|  |  Service       |  |  Service       |  |  Service         |    |
|  |                |  |                |  |                  |    |
|  | - Zammad API   |  | - CSV/Excel   |  | - Middleware     |    |
|  | - Ticket sync  |  | - PDF (Weasy) |  | - DB Triggers    |    |
|  | - KB search    |  | - Parquet     |  | - TimescaleDB    |    |
|  |                |  | - Streaming   |  | - Tamper-proof   |    |
|  +----------------+  +----------------+  +------------------+    |
+------------------------------------------------------------------+
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
+------------------------------------------------------------------+
|                   DATA LAYER                                      |
|  +----------------+  +----------------+  +------------------+    |
|  |  PostgreSQL    |  |  Redis         |  |  Elasticsearch  |    |
|  |  (Primary DB)  |  |  (Cache/Queue) |  |  (Search/Logs)  |    |
|  |                |  |                |  |                 |    |
|  | - SQLAlchemy   |  | - Sessions    |  | - Full-text     |    |
|  | - Alembic      |  | - Rate limit  |  | - Log search    |    |
|  | - TimescaleDB  |  | - Celery      |  | - Analytics     |    |
|  | - pgAudit      |  |   backend     |  |                 |    |
|  +----------------+  +----------------+  +------------------+    |
|                                                                   |
|  +----------------+  +----------------+  +------------------+    |
|  |  S3/MinIO      |  |  Prometheus    |  |  Jaeger         |    |
|  |  (File Store)  |  |  (Metrics)     |  |  (Tracing)      |    |
|  +----------------+  +----------------+  +------------------+    |
+------------------------------------------------------------------+
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
+------------------------------------------------------------------+
|              EXTERNAL SERVICES (API Integration)                  |
|  +----------------+  +----------------+  +------------------+    |
|  |  Stripe        |  |  Zammad        |  |  Metabase       |    |
|  |  (Billing)     |  |  (Support)     |  |  (Analytics)    |    |
|  +----------------+  +----------------+  +------------------+    |
|  +----------------+  +----------------+  +------------------+    |
|  |  SendGrid      |  |  Sentry        |  |  Grafana        |    |
|  |  (Email)       |  |  (Errors)      |  |  (Dashboards)   |    |
|  +----------------+  +----------------+  +------------------+    |
+------------------------------------------------------------------+
```

### 9.2 Inter-Service Communication Patterns

```python
# FastAPI: Inter-service communication patterns

# Pattern 1: Synchronous HTTP (for immediate consistency)
from httpx import AsyncClient

class CRMServiceClient:
    def __init__(self, base_url: str = "http://crm-service:8000"):
        self.client = AsyncClient(base_url=base_url, timeout=30.0)
    
    async def get_contact(self, contact_id: int) -> dict:
        response = await self.client.get(f"/contacts/{contact_id}")
        return response.json()
    
    async def create_deal(self, deal_data: dict) -> dict:
        response = await self.client.post("/deals", json=deal_data)
        return response.json()

# Pattern 2: Asynchronous Events (for eventual consistency)
from celery import Celery
import json

celery_app = Celery('deepsynaps', broker='redis://redis:6379/0')

@celery_app.task(queue='crm.events')
def handle_contact_created_event(contact_id: int, organization_id: int):
    """Process contact creation side effects asynchronously"""
    
    # Update search index
    index_contact.delay(contact_id)
    
    # Check automation triggers
    evaluate_automation_triggers.delay(
        event_type='contact_created',
        entity_type='contact',
        entity_id=contact_id,
        organization_id=organization_id
    )
    
    # Update analytics counters
    increment_metric.delay(
        metric='contacts.total',
        organization_id=organization_id
    )
    
    # Notify integrations
    notify_webhook_subscribers.delay(
        event_type='contact.created',
        payload={'contact_id': contact_id}
    )

@celery_app.task(queue='analytics')
def increment_metric(metric: str, organization_id: int, value: int = 1):
    """Increment analytics metric in TimescaleDB"""
    from sqlalchemy import text
    
    db.execute(text("""
        INSERT INTO analytics.metrics (time, organization_id, metric, value)
        VALUES (NOW(), :org_id, :metric, :value)
    """), {'org_id': organization_id, 'metric': metric, 'value': value})
    db.commit()

@celery_app.task(queue='notifications')
def notify_webhook_subscribers(event_type: str, payload: dict):
    """Send webhook notifications to subscribed endpoints"""
    
    subscribers = db.query(WebhookSubscription).filter(
        WebhookSubscription.event_types.contains([event_type]),
        WebhookSubscription.is_active == True
    ).all()
    
    for sub in subscribers:
        send_webhook.delay(sub.endpoint_url, event_type, payload, sub.secret_key)

@celery_app.task(queue='notifications', max_retries=3)
def send_webhook(endpoint_url: str, event_type: str, payload: dict, secret: str):
    """Send individual webhook with retry logic"""
    import hmac, hashlib, json
    import requests
    
    payload_json = json.dumps(payload)
    signature = hmac.new(
        secret.encode(),
        payload_json.encode(),
        hashlib.sha256
    ).hexdigest()
    
    response = requests.post(
        endpoint_url,
        json=payload,
        headers={
            'X-DeepSynaps-Event': event_type,
            'X-DeepSynaps-Signature': f'sha256={signature}'
        },
        timeout=10
    )
    response.raise_for_status()

# Pattern 3: Outbox Pattern (for reliable event publishing)
class EventOutbox(Base):
    __tablename__ = 'event_outbox'
    
    id = Column(BigInteger, primary_key=True)
    event_type = Column(String(100), nullable=False)
    aggregate_type = Column(String(50), nullable=False)
    aggregate_id = Column(String(100), nullable=False)
    payload = Column(JSONB, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    published_at = Column(DateTime, nullable=True)
    publish_attempts = Column(Integer, default=0)

@app.post("/api/v1/contacts")
async def create_contact_with_outbox(contact: ContactCreate, db: Session = Depends(get_db)):
    """Create contact using outbox pattern for reliable event publishing"""
    
    # 1. Create contact in database
    db_contact = Contact(**contact.dict())
    db.add(db_contact)
    
    # 2. Write event to outbox (same transaction)
    event = EventOutbox(
        event_type='contact.created',
        aggregate_type='contact',
        aggregate_id=str(db_contact.id),
        payload={
            'id': db_contact.id,
            'email': db_contact.email,
            'first_name': db_contact.first_name,
            'last_name': db_contact.last_name,
            'organization_id': db_contact.organization_id
        }
    )
    db.add(event)
    
    # 3. Commit both in same transaction
    db.commit()
    db.refresh(db_contact)
    
    return db_contact

# Background worker polls outbox and publishes events
@celery_app.task(queue='outbox.publisher')
def publish_outbox_events():
    """Poll outbox table and publish unpublished events"""
    
    events = db.query(EventOutbox).filter(
        EventOutbox.published_at.is_(None),
        EventOutbox.publish_attempts < 5
    ).limit(100).all()
    
    for event in events:
        try:
            # Publish to Redis Pub/Sub or message queue
            redis_client.publish(
                f'crm.events.{event.event_type}',
                json.dumps({
                    'event_type': event.event_type,
                    'aggregate_type': event.aggregate_type,
                    'aggregate_id': event.aggregate_id,
                    'payload': event.payload,
                    'occurred_at': event.created_at.isoformat()
                })
            )
            
            event.published_at = datetime.utcnow()
            event.publish_attempts += 1
            db.commit()
            
        except Exception as e:
            event.publish_attempts += 1
            db.commit()
            logger.error(f"Failed to publish event {event.id}: {e}")

# Pattern 4: Saga Pattern (for distributed transactions)
class BillingSaga:
    """
    Saga orchestrator for subscription creation workflow.
    Coordinates multiple services to complete a business transaction.
    """
    
    def __init__(self):
        self.steps = []
        self.compensations = []
    
    async def execute(self, saga_id: str, params: dict) -> dict:
        """Execute saga steps with compensation on failure"""
        
        results = {}
        
        try:
            # Step 1: Validate plan
            plan = await self.validate_plan(params['plan_id'])
            results['plan'] = plan
            
            # Step 2: Create/update Stripe customer
            customer = await self.create_stripe_customer(params)
            results['customer'] = customer
            self.compensations.append(lambda: self.delete_stripe_customer(customer['id']))
            
            # Step 3: Create subscription in Stripe
            subscription = await self.create_stripe_subscription(
                customer['id'], plan['stripe_price_id']
            )
            results['subscription'] = subscription
            self.compensations.append(lambda: self.cancel_stripe_subscription(subscription['id']))
            
            # Step 4: Update organization billing record
            await self.update_organization_billing(params['organization_id'], {
                'stripe_customer_id': customer['id'],
                'stripe_subscription_id': subscription['id'],
                'plan_id': params['plan_id']
            })
            
            # Step 5: Provision resources
            await self.provision_resources(params['organization_id'], plan)
            
            # Step 6: Send welcome email
            await self.send_subscription_welcome(params['email'], plan)
            
            return {'status': 'completed', 'results': results}
            
        except Exception as e:
            # Execute compensations in reverse order
            for compensation in reversed(self.compensations):
                try:
                    await compensation()
                except Exception as ce:
                    logger.error(f"Compensation failed: {ce}")
            
            return {'status': 'failed', 'error': str(e), 'partial_results': results}
    
    async def validate_plan(self, plan_id: int):
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan or not plan.is_active:
            raise ValueError(f"Invalid plan: {plan_id}")
        return {'id': plan.id, 'stripe_price_id': plan.stripe_price_id, 'tier': plan.tier}
    
    async def create_stripe_customer(self, params: dict):
        customer = stripe.Customer.create(
            email=params['email'],
            name=params['name'],
            metadata={'organization_id': str(params['organization_id'])}
        )
        return {'id': customer.id}
    
    async def delete_stripe_customer(self, customer_id: str):
        stripe.Customer.delete(customer_id)
    
    async def create_stripe_subscription(self, customer_id: str, price_id: str):
        subscription = stripe.Subscription.create(
            customer=customer_id,
            items=[{'price': price_id}],
            trial_period_days=14
        )
        return {'id': subscription.id, 'status': subscription.status}
    
    async def cancel_stripe_subscription(self, subscription_id: str):
        stripe.Subscription.delete(subscription_id)
    
    async def update_organization_billing(self, org_id: int, billing_data: dict):
        billing = db.query(OrganizationBilling).filter(
            OrganizationBilling.organization_id == org_id
        ).first()
        
        if billing:
            billing.stripe_customer_id = billing_data['stripe_customer_id']
            billing.stripe_subscription_id = billing_data['stripe_subscription_id']
            billing.current_plan_id = billing_data['plan_id']
            db.commit()
    
    async def provision_resources(self, org_id: int, plan: dict):
        """Provision resources based on plan tier"""
        # Set usage limits
        limits = plan.get('features', {})
        redis_client.hset(f'org:{org_id}:limits', mapping=limits)
    
    async def send_subscription_welcome(self, email: str, plan: dict):
        await email_service.send_template(
            to=email,
            template='subscription_welcome',
            context={'plan_name': plan['tier']}
        )
```

### 9.3 Configuration Management

```python
# config.py - Unified configuration for all integrated services
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    """DeepSynaps application settings with external service configs"""
    
    # Application
    APP_NAME: str = "DeepSynaps CRM"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"  # development, staging, production
    SECRET_KEY: str
    
    # Database
    DATABASE_URL: str = "postgresql://user:pass@localhost/deepsynaps"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_POOL_SIZE: int = 50
    
    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_TAX_ENABLED: bool = False
    
    # Zammad (Support)
    ZAMMAD_ENABLED: bool = False
    ZAMMAD_URL: str = ""
    ZAMMAD_API_TOKEN: str = ""
    
    # Metabase (Analytics)
    METABASE_ENABLED: bool = False
    METABASE_URL: str = ""
    METABASE_SECRET_KEY: str = ""
    
    # Grafana (Monitoring)
    GRAFANA_ENABLED: bool = False
    GRAFANA_URL: str = ""
    GRAFANA_API_KEY: str = ""
    
    # Prometheus
    PROMETHEUS_ENABLED: bool = True
    METRICS_ENDPOINT: str = "/metrics"
    
    # Jaeger (Tracing)
    JAEGER_ENABLED: bool = False
    JAEGER_AGENT_HOST: str = "localhost"
    JAEGER_AGENT_PORT: int = 6831
    
    # Elasticsearch
    ELASTICSEARCH_ENABLED: bool = False
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    
    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@deepsynaps.io"
    
    # File Storage
    STORAGE_BACKEND: str = "local"  # local, s3, gcs, azure
    S3_BUCKET: str = ""
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    
    # Security
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24
    JWT_REFRESH_EXPIRATION_DAYS: int = 30
    PASSWORD_MIN_LENGTH: int = 12
    MFA_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    
    # Feature Flags
    FEATURE_AI_ASSISTANT: bool = False
    FEATURE_ADVANCED_REPORTING: bool = True
    FEATURE_CUSTOM_FIELDS: bool = True
    FEATURE_AUTOMATION: bool = True
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    return Settings()

# Dependency injection
from fastapi import Depends

def get_config() -> Settings:
    return get_settings()
```

---

## 10. Comparison Matrices

### 10.1 Master Feature Comparison Matrix

| Tool | Category | License | Stars | Language | FastAPI Ready | Self-Hosted | Resource Usage |
|------|----------|---------|-------|----------|---------------|-------------|----------------|
| **React Admin** | Admin | MIT | 25K+ | TypeScript | Yes (REST API) | Yes | Low |
| **refine** | Admin | MIT | 28K+ | TypeScript | Yes (REST/GraphQL) | Yes | Low |
| **AdminJS** | Admin | MIT | 5.5K+ | TypeScript | Adapter needed | Yes | Medium |
| **Appsmith** | Admin | Apache 2.0 | 34K+ | Java/React | REST/DB | Yes | High |
| **ToolJet** | Admin | AGPL-3.0 | 28K+ | JavaScript | REST/DB | Yes | High |
| **Metabase** | Analytics | AGPL-3.0 | 47.3K+ | Clojure/JS | REST + Embed | Yes | High |
| **Apache Superset** | Analytics | Apache 2.0 | 63K+ | Python/React | REST + Guest Token | Yes | High |
| **Cube.js** | Analytics | MIT | 17.5K+ | Rust/TS | Schema/API | Yes | Medium |
| **Lightdash** | Analytics | MIT | 3.5K+ | TypeScript | dbt-native | Yes | Medium |
| **SuiteCRM** | CRM | AGPL-3.0 | 5.4K+ | PHP | REST v8 | Yes | Medium |
| **EspoCRM** | CRM | AGPL-3.0 | 2.9K+ | PHP | REST v1 | Yes | Low-Medium |
| **OroCRM** | CRM | MIT | 642 | PHP/Symfony | JSON API | Yes | High |
| **Odoo CRM** | CRM | LGPL-3.0 | 41.5K+ | Python/JS | XML-RPC/REST | Yes | High |
| **Corteza** | CRM | Apache 2.0 | 1.2K+ | Go/Vue | REST | Yes | Medium |
| **Zammad** | Support | AGPL-3.0 | 5.6K+ | Ruby/JS | REST/GraphQL | Yes | High |
| **UVDesk** | Support | OSL-3.0 | 19K+ | PHP/Symfony | REST | Yes | Medium |
| **FreeScout** | Support | AGPL-3.0 | 4K+ | PHP/Laravel | REST (module) | Yes | Low |
| **osTicket** | Support | GPL-2.0 | 2.8K+ | PHP | REST (plugin) | Yes | Low |
| **Prometheus** | Monitoring | Apache 2.0 | 58K+ | Go | Client library | Yes | Low |
| **Grafana** | Monitoring | AGPL-3.0 | 68.7K+ | Go/TS | Data source | Yes | Medium |
| **Jaeger** | Monitoring | Apache 2.0 | 23K+ | Go | OpenTelemetry | Yes | Medium-High |
| **ELK Stack** | Monitoring | SSPL | 71K+ | Java | Logging | Yes | High |
| **Uptime Kuma** | Monitoring | MIT | 71.3K+ | Node.js | REST API | Yes | Low |
| **Custom Middleware** | Audit | Custom | N/A | Python | Native | Yes | Low |
| **PostgreSQL Triggers** | Audit | PostgreSQL | N/A | SQL | Native | Yes | Minimal |
| **TimescaleDB** | Audit | Apache 2.0 | 18.5K+ | C/PostgreSQL | Extension | Yes | Low |
| **PgAudit** | Audit | PostgreSQL | N/A | C | Extension | Yes | Minimal |
| **pandas** | Export | BSD-3 | 46K+ | Python/C | Native | Yes | Moderate |
| **WeasyPrint** | Export | BSD-3 | 7.3K+ | Python | Native | Yes | Medium |
| **Apache Arrow** | Export | Apache 2.0 | 14.5K+ | C++ | PyArrow | Yes | Low |
| **Stripe SDK** | Billing | MIT | 1.3K+ | Python | Native | Cloud | N/A |
| **Chargebee** | Billing | Proprietary | 200+ | Python | SDK | Cloud | N/A |
| **Kill Bill** | Billing | Apache 2.0 | 2.3K+ | Java | REST | Yes | High |

### 10.2 Integration Effort Matrix

| Tool | Setup Time | Code Complexity | Maintenance | Documentation |
|------|-----------|-----------------|-------------|---------------|
| React Admin | 2-3 days | Medium | Low | Excellent |
| refine | 3-4 days | Medium-High | Low | Good |
| AdminJS | 1-2 days | Low (auto-gen) | Medium | Fair |
| Appsmith | 1-2 days | Low (low-code) | Medium | Good |
| ToolJet | 1-2 days | Low (low-code) | Medium | Fair |
| Metabase | 2-3 hours | Low | Low | Excellent |
| Superset | 1-2 days | Medium | Medium | Good |
| Cube.js | 2-3 days | Medium-High | Medium | Good |
| Lightdash | 1-2 days | Medium | Low | Fair |
| Zammad | 2-4 hours | Low (API proxy) | Low | Good |
| FreeScout | 1-2 hours | Low | Low | Fair |
| Prometheus | 2-3 hours | Medium | Low | Excellent |
| Grafana | 2-3 hours | Low | Low | Excellent |
| Jaeger | 4-6 hours | Medium | Medium | Good |
| Stripe SDK | 1-2 days | Medium | Low | Excellent |
| Kill Bill | 3-5 days | High | High | Fair |

### 10.3 Cost Analysis (Self-Hosted)

| Tool | Infrastructure | Human Resources | Total Monthly* |
|------|---------------|-----------------|----------------|
| React Admin | $0 (static) | Low | $50-100 |
| refine | $0 (static) | Low | $50-100 |
| Metabase | $50-200 (JVM) | Low | $100-300 |
| Superset | $200-500 (multi-service) | Medium | $500-1,000 |
| Zammad | $100-300 (Ruby+ES) | Low | $200-500 |
| FreeScout | $20-50 (PHP) | Low | $50-100 |
| Prometheus | $50-100 | Low | $100-200 |
| Grafana | $50-200 | Low | $100-300 |
| TimescaleDB | Included in PostgreSQL | Low | $0 (extension) |
| Stripe | $0 (transaction fees only) | Low | Variable |
| Kill Bill | $200-500 (Java) | High | $500-1,500 |

*Estimated for small-medium deployment (100-1,000 users)

### 10.4 Performance Characteristics

| Tool | Latency | Throughput | Scalability | Caching |
|------|---------|-----------|-------------|---------|
| React Admin | Client-side | N/A | Frontend | HTTP cache |
| refine | Client-side | N/A | Frontend | React Query |
| Metabase | 100ms-5s | Medium | Vertical + cache | Aggressive |
| Superset | 100ms-30s | Medium | Celery workers | Redis |
| Cube.js | 10ms-1s | High | Pre-aggregations | Multi-level |
| Zammad | 50ms-500ms | Medium | Ruby limits | Rails cache |
| Prometheus | 1-10ms | Very High | Federation | TSDB |
| Grafana | 10-100ms | High | Stateless | Query cache |
| Stripe API | 100-500ms | High | Cloud | N/A |

---

## 11. Security & Compliance Matrix

### 11.1 License Compatibility Analysis

| License | Commercial Use | Modification | Distribution | SaaS Usage | Risk Level |
|---------|---------------|--------------|--------------|------------|------------|
| MIT | Yes | Yes | Yes | Yes | **Low** |
| Apache 2.0 | Yes | Yes | Yes | Yes | **Low** |
| BSD-3-Clause | Yes | Yes | Yes | Yes | **Low** |
| LGPL-3.0 | Yes | Yes | Yes | Yes | **Medium** |
| AGPL-3.0 | Yes | Yes | Yes | **Source must be available** | **High** |
| GPL-2.0 | Yes | Yes | Source required for distribution | Source required | **High** |
| OSL-3.0 | Yes | Yes | Copyleft applies to derivative works | Unclear | **Medium** |
| SSPL | Yes | Yes | **Must release as SSPL** | **High risk** | **Very High** |
| Proprietary | Per contract | No | No | Per contract | Variable |

**Key Implications for DeepSynaps CRM:**

- **MIT/Apache 2.0 tools** (refine, Prometheus, Jaeger, pandas, WeasyPrint) can be used freely in commercial SaaS without source disclosure requirements.
- **AGPL tools** (Metabase, Grafana, Zammad, ToolJet) require careful handling. Using them as separate services with API integration (not embedding in your application) is generally considered compliant, but legal review is recommended.
- **SSPL** (Elasticsearch) presents significant risk for SaaS offerings. Consider OpenSearch as an alternative.
- **Proprietary tools** (Chargebee) require contract review but typically have clear commercial terms.

### 11.2 Security Features by Tool

| Tool | Authentication | Authorization | Encryption | Audit Trail | RBAC |
|------|---------------|---------------|-----------|-------------|------|
| React Admin | OAuth/JWT/Basic | Role-based | HTTPS | N/A (frontend) | Custom |
| refine | OAuth/JWT/Auth0 | Granular ACL | HTTPS | Built-in audit | Yes |
| Metabase | SSO/SAML/LDAP | Sandboxing | HTTPS/TLS | Query logging | Yes |
| Superset | SSO/OAuth/LDAP | Row-level | HTTPS | Action logging | Yes |
| Zammad | LDAP/2FA/OAuth | Groups/Roles | HTTPS | Activity log | Yes |
| Prometheus | mTLS/Basic | N/A | mTLS | N/A | No |
| Grafana | SSO/SAML/OAuth | Org/Team/Folder | HTTPS | Audit log | Yes |
| Stripe | API keys/Webhooks | Signature verify | TLS 1.2+ | Full event log | Yes |
| Kill Bill | Basic/API keys | Per-tenant | HTTPS | Full audit | Yes |

### 11.3 Compliance Mapping

| Requirement | Implementation Approach |
|-------------|------------------------|
| **SOC 2 Type II** | Custom audit logging + TimescaleDB + pgAudit |
| **GDPR** | PostgreSQL row-level security + data export (pandas) + right to deletion |
| **CCPA** | Audit logs for data access + opt-out mechanisms |
| **HIPAA** | Encrypted PostgreSQL + access controls + audit trails (not recommended with AGPL tools) |
| **PCI DSS** | Stripe handles card data (SAQ-A) + scope reduction |
| **ISO 27001** | Comprehensive logging + access controls + encryption at rest/transit |

---

## 12. Final Recommendations

### 12.1 Recommended DeepSynaps CRM Stack

Based on the comprehensive analysis, the recommended open-source stack for DeepSynaps CRM is:

#### Tier 1: Core Architecture (Primary)

| Layer | Tool | License | Rationale |
|-------|------|---------|-----------|
| **Admin Frontend** | **refine** | MIT | Headless, highly customizable, native React Query, excellent FastAPI integration |
| **Analytics/BI** | **Metabase** | AGPL-3.0 | Best UX for non-technical users, powerful embedding, mature ecosystem |
| **Support Desk** | **Zammad** | AGPL-3.0 | Best multi-channel support, mature API, excellent for customer-facing CRM |
| **Monitoring** | **Prometheus + Grafana** | Apache 2.0 / AGPL-3.0 | Industry standard, extensive exporters, proven at scale |
| **Tracing** | **Jaeger** | Apache 2.0 | OpenTelemetry native, essential for microservices debugging |
| **Audit Logging** | **Custom FastAPI + TimescaleDB** | Custom/Apache 2.0 | Full control, tamper-proof (HMAC), purpose-built for CRM |
| **Data Export** | **pandas + WeasyPrint** | BSD-3-Clause | Flexible, well-documented, Python-native |
| **Billing** | **Stripe Python SDK** | MIT | Best developer experience, comprehensive features, PCI compliant |

#### Tier 2: Alternative/Supplemental

| Layer | Tool | License | Use Case |
|-------|------|---------|----------|
| Admin Frontend | React Admin | MIT | Simpler admin needs, less customization |
| Analytics | Apache Superset | Apache 2.0 | Enterprise analytics, more visualization types |
| Analytics API | Cube.js | MIT | Embedded analytics, API-first approach |
| Support Desk | FreeScout | AGPL-3.0 | Lightweight shared inbox (smaller teams) |
| Log Aggregation | ELK Stack / Loki | SSPL / AGPL-3.0 | Advanced log search and alerting |
| Uptime Monitoring | Uptime Kuma | MIT | Simple uptime checks, status pages |
| Open Billing | Kill Bill | Apache 2.0 | Full control over billing logic, no Stripe fees |

#### Tier 3: Reference Architecture Only

| Tool | License | Purpose |
|------|---------|---------|
| SuiteCRM | AGPL-3.0 | Reference for CRM feature completeness |
| EspoCRM | AGPL-3.0 | Reference for lightweight CRM design |
| Odoo CRM | LGPL-3.0 | Reference for ERP integration patterns |
| OroCRM | MIT | Reference for B2B CRM features |
| Corteza | Apache 2.0 | Reference for low-code platform design |

### 12.2 Implementation Roadmap

#### Phase 1: Foundation (Weeks 1-4)
1. Set up FastAPI + SQLAlchemy + PostgreSQL core
2. Implement custom audit logging with middleware
3. Deploy Prometheus + Grafana for monitoring
4. Integrate Stripe for billing
5. Build basic CRUD with refine frontend

#### Phase 2: Core CRM (Weeks 5-8)
1. Implement contacts, deals, organizations modules
2. Build sales pipeline visualization
3. Add activity tracking and tasks
4. Integrate Metabase for analytics dashboards
5. Implement data export (CSV, Excel, PDF)

#### Phase 3: Support & Operations (Weeks 9-12)
1. Integrate Zammad for support ticketing
2. Add webhook handling for external services
3. Implement usage-based billing metering
4. Deploy Jaeger for distributed tracing
5. Set up automated backups and disaster recovery

#### Phase 4: Scale & Polish (Weeks 13-16)
1. Add advanced reporting and forecasting
2. Implement workflow automation
3. Build customer self-service portal
4. Performance optimization and caching
5. Security hardening and penetration testing

### 12.3 Critical Success Factors

1. **Start with MIT/Apache 2.0 licensed tools** to avoid legal complexity in early stages
2. **Build the audit logging system first** -- it is harder to add retroactively
3. **Design for multi-tenancy from day one** -- all data models must include `organization_id`
4. **Use API-first integration** for AGPL tools -- keep them as separate services
5. **Implement the outbox pattern** for reliable event publishing between services
6. **Instrument everything with Prometheus** from the beginning
7. **Use Stripe for billing initially** -- migrate to Kill Bill only if transaction volume justifies the operational overhead

### 12.4 Risk Mitigation

| Risk | Mitigation Strategy |
|------|-------------------|
| AGPL license contamination | Keep AGPL tools as separate networked services, not linked libraries |
| Vendor lock-in (Stripe) | Abstract billing behind internal service interface |
| Data loss | PostgreSQL streaming replication + automated backups |
| Performance degradation | Implement caching layers, database indexing, query optimization |
| Security breaches | Defense in depth: WAF, RBAC, audit logging, encryption, penetration testing |
| Tool abandonment | Prefer CNCF/Apache projects with large communities |

---

## Appendix A: Quick-Start Docker Compose

```yaml
# docker-compose.yml - Quick start for DeepSynaps CRM stack
version: '3.8'

services:
  # Core API
  api:
    build: ./api
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://deepsynaps:password@postgres:5432/deepsynaps
      - REDIS_URL=redis://redis:6379/0
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - METABASE_SECRET_KEY=${METABASE_SECRET_KEY}
    depends_on:
      - postgres
      - redis
    volumes:
      - ./api:/app
    command: uvicorn main:app --host 0.0.0.0 --reload

  # Frontend
  web:
    build: ./web
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:8000
    volumes:
      - ./web:/app
      - /app/node_modules

  # Database
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      - POSTGRES_USER=deepsynaps
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=deepsynaps
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d

  # Cache & Queue
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Task Queue Worker
  worker:
    build: ./api
    environment:
      - DATABASE_URL=postgresql://deepsynaps:password@postgres:5432/deepsynaps
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    command: celery -A tasks worker --loglevel=info

  # Scheduler
  scheduler:
    build: ./api
    environment:
      - DATABASE_URL=postgresql://deepsynaps:password@postgres:5432/deepsynaps
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
    command: celery -A tasks beat --loglevel=info

  # Metabase (Analytics)
  metabase:
    image: metabase/metabase:latest
    ports:
      - "3001:3000"
    environment:
      - MB_DB_TYPE=postgres
      - MB_DB_DBNAME=metabase
      - MB_DB_PORT=5432
      - MB_DB_USER=deepsynaps
      - MB_DB_PASS=password
      - MB_DB_HOST=postgres
      - MB_ENCRYPTION_SECRET_KEY=${METABASE_SECRET_KEY}

  # Zammad (Support)
  zammad:
    image: zammad/zammad:latest
    ports:
      - "3002:80"
    environment:
      - POSTGRESQL_HOST=postgres
      - POSTGRESQL_DB=zammad
      - POSTGRESQL_USER=deepsynaps
      - POSTGRESQL_PASS=password
      - ELASTICSEARCH_ENABLED=false

  # Prometheus (Metrics)
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  # Grafana (Dashboards)
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3003:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards

  # Jaeger (Tracing)
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "6831:6831/udp"
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  # Uptime Kuma (Monitoring)
  uptime:
    image: louislam/uptime-kuma:latest
    ports:
      - "3004:3001"
    volumes:
      - uptime_data:/app/data

volumes:
  postgres_data:
  prometheus_data:
  grafana_data:
  uptime_data:
```

## Appendix B: Environment Variables Template

```bash
# .env - DeepSynaps CRM Configuration

# Application
DEBUG=false
ENVIRONMENT=production
SECRET_KEY=generate-strong-secret-here

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/deepsynaps
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://localhost:6379/0

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Metabase
METABASE_URL=http://metabase:3000
METABASE_SECRET_KEY=...

# Zammad
ZAMMAD_URL=http://zammad:80
ZAMMAD_API_TOKEN=...

# Monitoring
PROMETHEUS_ENABLED=true
JAEGER_ENABLED=true
GRAFANA_URL=http://grafana:3000

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=...

# Storage
STORAGE_BACKEND=s3
S3_BUCKET=deepsynaps-files
S3_REGION=us-east-1

# Feature Flags
FEATURE_AI_ASSISTANT=false
FEATURE_ADVANCED_REPORTING=true
```

## Appendix C: Database Migration Strategy

```python
# migrations/env.py - Alembic configuration for multi-tenant CRM
from alembic import context
from sqlalchemy import engine_from_config, pool
from logging.config import fileConfig
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.models import Base  # SQLAlchemy Base with all CRM models
from app.config import settings

config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata

def include_object(object, name, type_, reflected, compare_to):
    """Filter which database objects to include in migrations"""
    # Exclude audit log tables from auto-migrations (managed separately)
    if name.startswith('audit_logs'):
        return False
    # Exclude TimescaleDB hypertables
    if name.endswith('_ hypertable'):
        return False
    return True

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            # Enable batch mode for SQLite compatibility
            render_as_batch=True,
            # Generate type comparators
            compare_type=True,
            # Compare server defaults
            compare_server_default=True,
        )
        
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    context.configure(url=settings.DATABASE_URL)
    with context.begin_transaction():
        context.run_migrations()
else:
    run_migrations_online()
```

## Appendix D: API Design Conventions

```python
# FastAPI: Consistent API design patterns for CRM

# 1. Resource naming: plural nouns, kebab-case
#    GET    /api/v1/contacts          # List
#    POST   /api/v1/contacts          # Create
#    GET    /api/v1/contacts/{id}     # Retrieve
#    PUT    /api/v1/contacts/{id}     # Full update
#    PATCH  /api/v1/contacts/{id}     # Partial update
#    DELETE /api/v1/contacts/{id}     # Delete

# 2. Query parameters for filtering, sorting, pagination
#    ?status=lead&sort=-created_at&page=2&per_page=25

# 3. Nested resources for relationships
#    GET /api/v1/contacts/{id}/deals      # Contact's deals
#    GET /api/v1/contacts/{id}/activities # Contact's activity history
#    GET /api/v1/deals/{id}/timeline      # Deal's timeline events

# 4. Bulk operations
#    POST   /api/v1/contacts/bulk         # Create multiple
#    PATCH  /api/v1/contacts/bulk         # Update multiple
#    DELETE /api/v1/contacts/bulk         # Delete multiple

# 5. Action endpoints for operations
#    POST /api/v1/deals/{id}/convert      # Convert lead to deal
#    POST /api/v1/deals/{id}/stage        # Move to next stage
#    POST /api/v1/contacts/{id}/merge     # Merge duplicate contacts

# 6. Consistent response envelope
{
    "data": { ... },           # or [...] for lists
    "meta": {
        "total": 100,
        "page": 1,
        "per_page": 25,
        "total_pages": 4
    },
    "links": {
        "self": "/api/v1/contacts?page=1",
        "next": "/api/v1/contacts?page=2",
        "prev": null
    }
}

# 7. Error response format
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "The request validation failed",
        "details": [
            {"field": "email", "message": "Invalid email format"},
            {"field": "phone", "message": "Phone number required"}
        ],
        "trace_id": "uuid-for-debugging"
    }
}
```

## Appendix E: Testing Strategy

```python
# conftest.py - Pytest configuration for DeepSynaps CRM
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db

# Test database
SQLALCHEMY_DATABASE_URL = "postgresql://test:test@localhost/deepsynaps_test"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session")
def db_engine():
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    del app.dependency_overrides[get_db]

@pytest.fixture
def auth_client(client, db_session):
    """Authenticated test client"""
    # Create test user and get token
    user = create_test_user(db_session)
    token = create_access_token(user)
    client.headers["Authorization"] = f"Bearer {token}"
    return client

# Example test
class TestContactsAPI:
    def test_create_contact(self, auth_client):
        response = auth_client.post("/api/v1/contacts", json={
            "first_name": "John",
            "last_name": "Doe",
            "email": "john@example.com",
            "status": "lead"
        })
        
        assert response.status_code == 201
        data = response.json()["data"]
        assert data["first_name"] == "John"
        assert data["email"] == "john@example.com"
    
    def test_list_contacts_with_pagination(self, auth_client):
        response = auth_client.get("/api/v1/contacts?page=1&per_page=10")
        
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "meta" in data
        assert data["meta"]["page"] == 1
    
    def test_contact_not_found(self, auth_client):
        response = auth_client.get("/api/v1/contacts/99999")
        assert response.status_code == 404
    
    def test_audit_log_created(self, auth_client, db_session):
        # Create contact
        auth_client.post("/api/v1/contacts", json={
            "first_name": "Audit",
            "last_name": "Test",
            "email": "audit@example.com"
        })
        
        # Check audit log
        audit = db_session.query(AuditLog).filter(
            AuditLog.resource_type == "contacts",
            AuditLog.action == "CREATE"
        ).first()
        
        assert audit is not None
        assert audit.user_id is not None
```

## Appendix F: Performance Benchmarks

Based on typical deployment configurations:

| Operation | Target Latency | Throughput | Notes |
|-----------|---------------|-----------|-------|
| Contact CRUD | < 50ms p95 | 1,000 req/s | Single row, indexed |
| Deal pipeline query | < 100ms p95 | 500 req/s | Multi-table join |
| Bulk export (10K rows) | < 5s | 10 exports/min | Streaming CSV |
| PDF report generation | < 3s | 20 reports/min | WeasyPrint |
| Analytics dashboard | < 2s | 100 concurrent | Metabase cached |
| Support ticket create | < 200ms | 200 req/s | Zammad API proxy |
| Webhook processing | < 500ms | 500 events/s | Async Celery |
| Audit log write | < 10ms | 10,000 events/s | Async batch insert |

## Appendix G: Monitoring Checklist

- [ ] Application metrics (Prometheus + Grafana)
- [ ] Database query performance (pg_stat_statements)
- [ ] API endpoint latency and error rates
- [ ] Business metrics (contacts created, deals closed, revenue)
- [ ] Infrastructure monitoring (CPU, memory, disk, network)
- [ ] Log aggregation and search (ELK or Loki)
- [ ] Distributed tracing (Jaeger)
- [ ] Uptime monitoring (Uptime Kuma)
- [ ] SSL certificate expiry
- [ ] Dependency health checks
- [ ] Background job queue depth (Celery)
- [ ] Database connection pool utilization
- [ ] Cache hit/miss ratios (Redis)
- [ ] Error tracking (Sentry integration)
- [ ] Security event monitoring (failed logins, rate limit hits)

## Appendix H: Disaster Recovery Plan

| Component | RTO | RPO | Strategy |
|-----------|-----|-----|----------|
| PostgreSQL | 1 hour | 5 minutes | Streaming replication + WAL archiving |
| Redis | 15 minutes | 0 | AOF persistence + replica |
| File Storage (S3) | N/A | 0 | Cross-region replication |
| Application Code | 15 minutes | N/A | Container registry + Git |
| Configuration | 15 minutes | N/A | Infrastructure as Code (Terraform) |

---

## Document Information

- **Title:** Open-Source DeepSynaps CRM Stack Research Report
- **Version:** 1.0.0
- **Date:** 2026-05-15
- **Classification:** Technical Reference Architecture
- **Maintainer:** DeepSynaps Protocol Studio
- **Review Cycle:** Quarterly
- **Next Review:** 2026-08-15

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-15 | Initial comprehensive research report |

---

*This document was prepared by the DeepSynaps Protocol Studio research team. All recommendations are based on thorough analysis of each tool's capabilities, community health, license compatibility, and integration feasibility with the FastAPI + SQLAlchemy stack. Tools and versions referenced are current as of May 2026.*
