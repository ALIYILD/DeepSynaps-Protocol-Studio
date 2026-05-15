# Clinic Data Explorer Interface: Comprehensive Design Research Report

## Executive Summary

The Clinic Data Explorer is a healthcare-compliant data browsing interface designed for clinical staff, researchers, and administrators to navigate complex patient data with field-level security, audit trails, and HIPAA/GDPR compliance. This report covers architectural patterns, UX/UI design systems, implementation code, and compliance frameworks necessary to build a production-grade clinic data explorer.

**Target Users:** Clinical researchers, data stewards, compliance officers, physicians, nurses  
**Compliance Standards:** HIPAA (US), GDPR (EU), 21 CFR Part 11 (FDA)  
**Tech Stack Reference:** React/TypeScript, PostgreSQL, Elasticsearch, Redis  
**Estimated Implementation Effort:** 8-12 developer-weeks

---

## 1. Table Browser Patterns

### 1.1 Schema Discovery

Schema discovery enables users to understand available data tables, their purposes, and relationships without direct database access. The interface presents a searchable, filterable catalog of all accessible tables.

#### Wireframe Description

```
+-------------------------------------------------------------+
|  Clinic Data Explorer                              [?] [User] |
+-------------------------------------------------------------+
|  [Tables] [Schema] [Queries] [Audit Log]                      |
+-------------------------------------------------------------+
|  Search tables...  [Filter ▼] [Sort ▼]  [Refresh] [Grid/List]|
+-------------------------------------------------------------+
|  +------------------+  +------------------+  +---------------+ |
|  | patients         |  | encounters       |  | lab_results   | |
|  | ───────────────  |  | ───────────────  |  | ───────────── | |
|  | 📋 1,247 rows    |  | 📋 8,932 rows    |  | 📋 45,231 rows| |
|  | 🔒 HIPAA         |  | 🔒 HIPAA         |  | 🔒 HIPAA      | |
|  | ⭐ 98% complete  |  | ⭐ 94% complete  |  | ⭐ 91% complete| |
|  | 🔄 2 hours ago   |  | 🔄 30 min ago    |  | 🔄 1 day ago  | |
|  |                  |  |                  |  |               | |
|  | [Preview] [Schema] |  | [Preview] [Schema] | [Preview][Schema]| |
|  +------------------+  +------------------+  +---------------+ |
|  +------------------+  +------------------+  +---------------+ |
|  | medications      |  | vitals           |  | diagnoses     | |
|  | ───────────────  |  | ───────────────  |  | ───────────── | |
|  | 📋 3,456 rows    |  | 📋 12,045 rows   |  | 📋 2,189 rows | |
|  | 🔒 HIPAA         |  | 🔒 HIPAA         |  | 🔒 HIPAA      | |
|  | ⭐ 96% complete  |  | ⭐ 99% complete  |  | ⭐ 92% complete| |
|  | 🔄 4 hours ago   |  | 🔄 15 min ago    |  | 🔄 6 hours ago| |
|  |                  |  |                  |  |               | |
|  | [Preview] [Schema] |  | [Preview] [Schema] | [Preview][Schema]| |
|  +------------------+  +------------------+  +---------------+ |
+-------------------------------------------------------------+
```

#### CSS Pattern

```css
/* Table Card Grid Layout */
.table-browser-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
  padding: 1.5rem;
  background-color: #f8fafc;
}

.table-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.table-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.table-card:hover::before {
  opacity: 1;
}

.table-card:hover {
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.table-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.table-card-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  font-family: 'Inter', system-ui, sans-serif;
}

.table-card-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #64748b;
}

.table-card-meta-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

/* HIPAA Badge */
.compliance-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.compliance-badge.hipaa {
  background-color: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.compliance-badge.gdpr {
  background-color: #dbeafe;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}

/* Completeness Indicator */
.completeness-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.completeness-bar {
  width: 60px;
  height: 6px;
  background-color: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.completeness-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.completeness-bar-fill.high { background-color: #22c55e; }
.completeness-bar-fill.medium { background-color: #f59e0b; }
.completeness-bar-fill.low { background-color: #ef4444; }

/* Last Updated Timestamp */
.last-updated {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: #94a3b8;
}

.last-updated.recent {
  color: #16a34a;
}

.last-updated.stale {
  color: #dc2626;
}
```

#### JavaScript Implementation Pattern

```typescript
// TableCard.tsx - React Component
import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface TableMetadata {
  id: string;
  name: string;
  displayName: string;
  rowCount: number;
  rowCountEstimate: boolean;
  lastUpdated: Date;
  completenessScore: number;
  complianceTags: ('HIPAA' | 'GDPR' | 'FDA_21CFR11')[];
  description: string;
  category: string;
  columnCount: number;
  relationships: TableRelationship[];
}

interface TableRelationship {
  targetTable: string;
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
  foreignKeyColumn: string;
  targetColumn: string;
}

const TableCard: React.FC<{ table: TableMetadata }> = ({ table }) => {
  const [expanded, setExpanded] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);

  const getCompletenessColor = (score: number) => {
    if (score >= 95) return 'high';
    if (score >= 80) return 'medium';
    return 'low';
  };

  const getRowCountDisplay = (count: number, isEstimate: boolean) => {
    if (count >= 1_000_000) return `~${(count / 1_000_000).toFixed(1)}M rows`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k rows`;
    return `${count} rows${isEstimate ? ' (est.)' : ''}`;
  };

  const isRecent = (date: Date) => {
    const hoursDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    return hoursDiff < 24;
  };

  return (
    <div className="table-card" role="article" aria-label={`Table ${table.displayName}`}>
      <div className="table-card-header">
        <span className="table-icon">📋</span>
        <h3 className="table-card-title">{table.displayName}</h3>
      </div>
      
      <div className="table-card-meta">
        <div className="table-card-meta-item">
          {getRowCountDisplay(table.rowCount, table.rowCountEstimate)}
        </div>
        
        <div className="table-card-meta-item">
          {table.complianceTags.map(tag => (
            <span key={tag} className={`compliance-badge ${tag.toLowerCase()}`}>
              🔒 {tag}
            </span>
          ))}
        </div>
        
        <div className="table-card-meta-item completeness-indicator">
          <span>⭐ {table.completenessScore}% complete</span>
          <div className="completeness-bar">
            <div 
              className={`completeness-bar-fill ${getCompletenessColor(table.completenessScore)}`}
              style={{ width: `${table.completenessScore}%` }}
            />
          </div>
        </div>
        
        <div className={`table-card-meta-item last-updated ${isRecent(table.lastUpdated) ? 'recent' : 'stale'}`}>
          🔄 {formatDistanceToNow(table.lastUpdated)} ago
        </div>
      </div>

      <div className="table-card-actions">
        <button 
          onClick={() => setPreviewData(null)}
          className="btn btn-secondary btn-sm"
        >
          Preview
        </button>
        <button 
          onClick={() => setExpanded(!expanded)}
          className="btn btn-secondary btn-sm"
        >
          Schema
        </button>
        <button 
          className="btn btn-primary btn-sm"
          onClick={() => navigateToTable(table.id)}
        >
          Browse
        </button>
      </div>

      {expanded && (
        <TableRelationshipMap 
          relationships={table.relationships} 
          tableName={table.name}
        />
      )}
    </div>
  );
};

// Schema Discovery Hook
const useSchemaDiscovery = () => {
  const [tables, setTables] = useState<TableMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const discoverSchema = async (filters?: SchemaFilters) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/schema/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
          'X-Audit-Context': JSON.stringify(getAuditContext())
        },
        body: JSON.stringify({
          filters,
          includeRowCounts: true,
          includeComplianceInfo: true
        })
      });
      
      if (!response.ok) throw new Error('Schema discovery failed');
      
      const data = await response.json();
      setTables(data.tables);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return { tables, loading, error, discoverSchema };
};
```

### 1.2 Column Metadata Display

Each table exposes its column metadata including data types, constraints, descriptions, and PHI classification.

```typescript
// ColumnMetadata.ts
interface ColumnMetadata {
  name: string;
  displayName: string;
  dataType: string;           // PostgreSQL type: 'varchar(255)', 'integer', 'timestamp'
  nullable: boolean;
  defaultValue: string | null;
  constraints: ColumnConstraint[];
  description: string;
  phiClassification: 'direct' | 'quasi' | 'sensitive' | 'non-phi';
  maskingPolicy: MaskingPolicy | null;
  statistics: ColumnStatistics;
}

interface ColumnConstraint {
  type: 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK' | 'NOT_NULL';
  name: string;
  definition: string;
}

interface MaskingPolicy {
  ruleId: string;
  maskType: 'full' | 'partial' | 'hash' | 'nullify' | 'role_based';
  allowedRoles: string[];
  revealOnHover: boolean;
}

interface ColumnStatistics {
  distinctCount: number;
  nullCount: number;
  nullPercentage: number;
  minValue: string | null;
  maxValue: string | null;
  avgValue: string | null;
  mostCommonValues: { value: string; frequency: number }[];
}
```

#### Column Metadata Display Pattern

```
+-------------------------------------------------------------+
|  Table: patients                                            |
+-------------------------------------------------------------+
|  Columns:                                                   |
|  +------+-------------+------------------+------+----------+ |
|  | Col  | Type        | Description      | PHI  | Status   | |
|  +------+-------------+------------------+------+----------+ |
|  | id   | uuid PK     | Unique patient   | None | ✅       | |
|  |      |             | identifier       |      |          | |
|  +------+-------------+------------------+------+----------+ |
|  | mr_n | varchar(50) | Medical record   | 🔒   | ████░░   | |
|  | umber|             | number           | Dir. | 78% fill | |
|  +------+-------------+------------------+------+----------+ |
|  | first| varchar(100)| Patient first    | 🔒   | ██████   | |
|  |_name |             | name             | Dir. | 99% fill | |
|  +------+-------------+------------------+------+----------+ |
|  | dob  | date        | Date of birth    | 🔒   | █████░   | |
|  |      |             |                  | Quasi| 92% fill | |
|  +------+-------------+------------------+------+----------+ |
|  | emai | varchar(255)| Contact email    | 🔒   | ███░░░   | |
|  | l    |             | address          | Dir. | 45% fill | |
|  +------+-------------+------------------+------+----------+ |
|  | creat| timestamp   | Record creation  | None | ██████   | |
|  | ed_at|             | timestamp        |      | 100%     | |
|  +------+-------------+------------------+------+----------+ |
+-------------------------------------------------------------+
```

### 1.3 Row Count Estimation

For large tables, exact row counts can be expensive. Use PostgreSQL statistics for estimation with progressive refinement.

```typescript
// RowCountEstimator.ts
class RowCountEstimator {
  private cache: Map<string, { count: number; timestamp: number; exact: boolean }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getRowCount(tableName: string, options: { exact?: boolean; maxWaitMs?: number } = {}): Promise<{
    count: number;
    exact: boolean;
    cached: boolean;
    estimatedAt: Date;
  }> {
    const cacheKey = `${tableName}:${options.exact ? 'exact' : 'estimate'}`;
    const cached = this.cache.get(cacheKey);
    
    // Return cached value if fresh
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return {
        count: cached.count,
        exact: cached.exact,
        cached: true,
        estimatedAt: new Date(cached.timestamp)
      };
    }

    // For large tables, use pg_class estimate first
    if (!options.exact) {
      const estimate = await this.getPgClassEstimate(tableName);
      this.cache.set(cacheKey, { count: estimate, timestamp: Date.now(), exact: false });
      return { count: estimate, exact: false, cached: false, estimatedAt: new Date() };
    }

    // Exact count with timeout protection
    const exactCount = await this.getExactCountWithTimeout(tableName, options.maxWaitMs || 5000);
    this.cache.set(cacheKey, { count: exactCount, timestamp: Date.now(), exact: true });
    return { count: exactCount, exact: true, cached: false, estimatedAt: new Date() };
  }

  private async getPgClassEstimate(tableName: string): Promise<number> {
    const query = `
      SELECT reltuples::BIGINT as estimate 
      FROM pg_class 
      WHERE relname = $1
    `;
    const result = await db.query(query, [tableName]);
    return result.rows[0]?.estimate || 0;
  }

  private async getExactCountWithTimeout(tableName: string, maxWaitMs: number): Promise<number> {
    const query = `SELECT COUNT(*)::INTEGER as count FROM "${tableName}"`;
    // Implementation using Promise.race with timeout
    const countPromise = db.query(query);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Count query timeout')), maxWaitMs)
    );
    
    try {
      const result = await Promise.race([countPromise, timeoutPromise]);
      return result.rows[0]?.count || 0;
    } catch (err) {
      // Fallback to estimate on timeout
      return this.getPgClassEstimate(tableName);
    }
  }

  invalidateCache(tableName?: string): void {
    if (tableName) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(tableName + ':')) this.cache.delete(key);
      }
    } else {
      this.cache.clear();
    }
  }
}
```

### 1.4 Last Updated Tracking

Track when each table was last modified using audit triggers or database metadata.

```sql
-- PostgreSQL audit trigger for last_updated tracking
CREATE OR REPLACE FUNCTION update_table_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the last_modified timestamp on the record
    NEW.last_modified = NOW();
    
    -- Insert into audit log
    INSERT INTO table_modification_log (table_name, operation, modified_at, record_id)
    VALUES (TG_TABLE_NAME, TG_OP, NOW(), COALESCE(NEW.id, OLD.id));
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all HIPAA-tables
CREATE TRIGGER patients_modification_trigger
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_table_timestamp();
```

```typescript
// LastUpdatedTracker.ts
interface TableModificationRecord {
  tableName: string;
  lastInsert: Date | null;
  lastUpdate: Date | null;
  lastDelete: Date | null;
  lastAnyOperation: Date | null;
  totalModifications24h: number;
}

class LastUpdatedTracker {
  async getTableActivity(tableName: string): Promise<TableModificationRecord> {
    const query = `
      SELECT 
        table_name,
        MAX(CASE WHEN operation = 'INSERT' THEN modified_at END) as last_insert,
        MAX(CASE WHEN operation = 'UPDATE' THEN modified_at END) as last_update,
        MAX(CASE WHEN operation = 'DELETE' THEN modified_at END) as last_delete,
        MAX(modified_at) as last_any_operation,
        COUNT(CASE WHEN modified_at > NOW() - INTERVAL '24 hours' THEN 1 END) as modifications_24h
      FROM table_modification_log
      WHERE table_name = $1
      GROUP BY table_name
    `;
    
    const result = await db.query(query, [tableName]);
    return this.formatRecord(result.rows[0]);
  }

  async getAllTableActivity(): Promise<TableModificationRecord[]> {
    const query = `
      WITH latest_modifications AS (
        SELECT DISTINCT ON (table_name)
          table_name,
          modified_at as last_any_operation,
          operation
        FROM table_modification_log
        ORDER BY table_name, modified_at DESC
      )
      SELECT 
        table_name,
        last_any_operation,
        COUNT(CASE WHEN modified_at > NOW() - INTERVAL '24 hours' THEN 1 END) as modifications_24h
      FROM table_modification_log
      GROUP BY table_name, last_any_operation
      ORDER BY last_any_operation DESC
    `;
    
    const result = await db.query(query);
    return result.rows.map(row => this.formatRecord(row));
  }
}
```

### 1.5 Relationship Mapping

Visual graph of table relationships showing foreign key chains and join paths.

```typescript
// RelationshipMapper.ts
interface RelationshipGraph {
  nodes: TableNode[];
  edges: RelationshipEdge[];
}

interface TableNode {
  id: string;
  label: string;
  category: string;
  rowCount: number;
  hipaaClassified: boolean;
}

interface RelationshipEdge {
  source: string;
  target: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  sourceColumn: string;
  targetColumn: string;
  constraintName: string;
}

const generateRelationshipGraph = async (rootTable?: string): Promise<RelationshipGraph> => {
  const query = `
    SELECT
      tc.table_name as source_table,
      ccu.table_name as target_table,
      tc.constraint_name,
      kcu.column_name as source_column,
      ccu.column_name as target_column,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc2
          WHERE tc2.table_name = ccu.table_name 
          AND tc2.constraint_type = 'UNIQUE'
          AND tc2.constraint_name LIKE '%' || ccu.column_name || '%'
        ) THEN 'one-to-one'
        ELSE 'one-to-many'
      END as relationship_type
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ${rootTable ? `AND (tc.table_name = $1 OR ccu.table_name = $1)` : ''}
  `;
  
  const params = rootTable ? [rootTable] : [];
  const result = await db.query(query, params);
  
  // Build graph from query results
  const nodes = new Map<string, TableNode>();
  const edges: RelationshipEdge[] = [];
  
  for (const row of result.rows) {
    // Add nodes
    if (!nodes.has(row.source_table)) {
      nodes.set(row.source_table, {
        id: row.source_table,
        label: row.source_table,
        category: await getTableCategory(row.source_table),
        rowCount: await getRowCount(row.source_table),
        hipaaClassified: await isHipaaClassified(row.source_table)
      });
    }
    if (!nodes.has(row.target_table)) {
      nodes.set(row.target_table, {
        id: row.target_table,
        label: row.target_table,
        category: await getTableCategory(row.target_table),
        rowCount: await getRowCount(row.target_table),
        hipaaClassified: await isHipaaClassified(row.target_table)
      });
    }
    
    edges.push({
      source: row.source_table,
      target: row.target_table,
      type: row.relationship_type,
      sourceColumn: row.source_column,
      targetColumn: row.target_column,
      constraintName: row.constraint_name
    });
  }
  
  return {
    nodes: Array.from(nodes.values()),
    edges
  };
};
```

---

## 2. Query Interface

### 2.1 Visual Query Builder

A drag-and-drop interface for constructing queries without SQL knowledge.

#### Wireframe Description

```
+-------------------------------------------------------------+
|  Query Builder                                    [SQL ▼]    |
+-------------------------------------------------------------+
|                                                             |
|  +---------------+  +-------------------------------------+   |
|  | TABLES        |  | CANVAS                              |   |
|  |               |  |                                     |   |
|  | 📋 patients   |  |  +---------------------------+       |   |
|  | 📋 encounters |  |  | patients                  |       |   |
|  | 📋 vitals     |  |  | ───────────────────────── |       |   |
|  | 📋 labs       |  |  | [id      ] [=] [         ]|       |   |
|  | 📋 meds       |  |  | [dob     ] [>] [2020-01-01]|      |   |
|  | 📋 diagnoses  |  |  | [gender  ] [in] [M,F      ]|      |   |
|  |               |  |  +------------┬--------------+       |   |
|  |               |  |               | 1:N                  |   |
|  |               |  |               ▼                      |   |
|  |               |  |  +---------------------------+       |   |
|  |               |  |  | encounters                |       |   |
|  |               |  |  | ───────────────────────── |       |   |
|  |               |  |  | [enc_date] [>] [2024-01-01]|      |   |
|  |               |  |  | [type    ] [=] [outpatient]|      |   |
|  |               |  |  +---------------------------+       |   |
|  |               |  |                                     |   |
|  +---------------+  +-------------------------------------+   |
|                                                             |
|  +--------------------------------------------------------+ |
|  | RESULT PREVIEW                      [Run] [Save] [Export]| |
|  +--------------------------------------------------------+ |
|  | id | first_name | dob        | enc_date   | type        | |
|  +----+------------+------------+------------+-------------+ |
|  |    | ████       | ████       | 2024-03-15 | outpatient  | |
|  |    | ████       | ████       | 2024-03-22 | outpatient  | |
|  |    | ████       | ████       | 2024-04-01 | outpatient  | |
|  +----+------------+------------+------------+-------------+ |
|  Page 1 of 47  [Prev] [Next]  Showing 10 of 46,231         |
+-------------------------------------------------------------+
```

#### CSS Pattern

```css
/* Query Builder Layout */
.query-builder-container {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 1fr auto;
  height: calc(100vh - 60px);
  gap: 0;
}

.query-sidebar {
  background: #f1f5f9;
  border-right: 1px solid #cbd5e1;
  padding: 1rem;
  overflow-y: auto;
}

.query-canvas {
  background: #ffffff;
  padding: 1.5rem;
  overflow: auto;
  position: relative;
}

.query-result-panel {
  grid-column: 1 / -1;
  border-top: 1px solid #cbd5e1;
  background: #ffffff;
  max-height: 400px;
  overflow: auto;
}

/* Table Block on Canvas */
.query-table-block {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  min-width: 280px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  position: absolute;
  cursor: move;
}

.query-table-block-header {
  background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
  color: #ffffff;
  padding: 0.5rem 0.75rem;
  border-radius: 8px 8px 0 0;
  font-weight: 600;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.query-table-block-body {
  padding: 0.5rem;
}

/* Condition Row */
.condition-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.condition-row:hover {
  background-color: #f8fafc;
}

.condition-row .field-select {
  width: 120px;
  font-size: 0.8125rem;
}

.condition-row .operator-select {
  width: 80px;
  font-size: 0.8125rem;
}

.condition-row .value-input {
  flex: 1;
  font-size: 0.8125rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}

/* Relationship Connector */
.relationship-connector {
  position: absolute;
  pointer-events: none;
}

.relationship-connector line {
  stroke: #94a3b8;
  stroke-width: 2;
  stroke-dasharray: 5, 5;
}

.relationship-connector text {
  fill: #64748b;
  font-size: 0.75rem;
  background: #ffffff;
}

/* Sidebar Table List */
.sidebar-table-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.15s ease;
  font-size: 0.875rem;
  color: #334155;
}

.sidebar-table-item:hover {
  background-color: #e2e8f0;
}

.sidebar-table-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

/* Query Toolbar */
.query-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.query-toolbar .btn-run {
  background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
  color: #ffffff;
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.query-toolbar .btn-run:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
}

.query-toolbar .btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
```

#### JavaScript Implementation Pattern

```typescript
// VisualQueryBuilder.tsx
import React, { useState, useCallback, useRef } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Types
interface QueryCondition {
  id: string;
  column: string;
  operator: QueryOperator;
  value: any;
  logicalOperator: 'AND' | 'OR';
  groupId: string | null;
}

type QueryOperator = 
  | '=' | '!=' | '<>' 
  | '>' | '<' | '>=' | '<=' 
  | 'IN' | 'NOT_IN' | 'BETWEEN' 
  | 'LIKE' | 'NOT_LIKE' | 'IS_NULL' | 'IS_NOT_NULL';

interface QueryTable {
  id: string;
  tableName: string;
  alias: string;
  x: number;
  y: number;
  columns: string[];
  conditions: QueryCondition[];
  selectedColumns: string[];
}

interface QueryJoin {
  id: string;
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
}

interface QueryState {
  tables: QueryTable[];
  joins: QueryJoin[];
  orderBy: { column: string; direction: 'ASC' | 'DESC' }[];
  limit: number | null;
  offset: number;
}

// SQL Generator
class SQLQueryGenerator {
  generateQuery(state: QueryState): string {
    const parts: string[] = [];
    
    // SELECT
    const selectColumns = state.tables.flatMap(t => 
      t.selectedColumns.map(col => `${t.alias}.${col}`)
    );
    parts.push(`SELECT ${selectColumns.length > 0 ? selectColumns.join(', ') : '*'}`);
    
    // FROM
    if (state.tables.length > 0) {
      parts.push(`FROM ${state.tables[0].tableName} AS ${state.tables[0].alias}`);
    }
    
    // JOINS
    for (const join of state.joins) {
      const joinSQL = `${join.joinType} JOIN ${join.rightTable} AS ${join.rightTable} 
        ON ${join.leftTable}.${join.leftColumn} = ${join.rightTable}.${join.rightColumn}`;
      parts.push(joinSQL);
    }
    
    // WHERE
    const whereConditions = this.buildWhereClause(state.tables);
    if (whereConditions) {
      parts.push(`WHERE ${whereConditions}`);
    }
    
    // ORDER BY
    if (state.orderBy.length > 0) {
      const orderSQL = state.orderBy.map(o => `${o.column} ${o.direction}`).join(', ');
      parts.push(`ORDER BY ${orderSQL}`);
    }
    
    // LIMIT
    if (state.limit) {
      parts.push(`LIMIT ${state.limit}`);
    }
    if (state.offset > 0) {
      parts.push(`OFFSET ${state.offset}`);
    }
    
    return parts.join('\n');
  }

  private buildWhereClause(tables: QueryTable[]): string | null {
    const conditions: string[] = [];
    
    for (const table of tables) {
      for (const condition of table.conditions) {
        if (!condition.column || !condition.operator) continue;
        
        let sql: string;
        const qualifiedColumn = `${table.alias}.${condition.column}`;
        
        switch (condition.operator) {
          case 'IS_NULL':
            sql = `${qualifiedColumn} IS NULL`;
            break;
          case 'IS_NOT_NULL':
            sql = `${qualifiedColumn} IS NOT NULL`;
            break;
          case 'IN':
          case 'NOT_IN':
            const values = Array.isArray(condition.value) 
              ? condition.value.map(v => this.escapeValue(v)).join(', ')
              : this.escapeValue(condition.value);
            sql = `${qualifiedColumn} ${condition.operator} (${values})`;
            break;
          case 'BETWEEN':
            if (Array.isArray(condition.value) && condition.value.length === 2) {
              sql = `${qualifiedColumn} BETWEEN ${this.escapeValue(condition.value[0])} 
                AND ${this.escapeValue(condition.value[1])}`;
            } else {
              continue;
            }
            break;
          case 'LIKE':
          case 'NOT_LIKE':
            sql = `${qualifiedColumn} ${condition.operator} ${this.escapeValue(condition.value)}`;
            break;
          default:
            sql = `${qualifiedColumn} ${condition.operator} ${this.escapeValue(condition.value)}`;
        }
        
        conditions.push(sql);
      }
    }
    
    return conditions.length > 0 ? conditions.join(' AND ') : null;
  }

  private escapeValue(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (Array.isArray(value)) return value.map(v => this.escapeValue(v)).join(', ');
    // Use parameterized queries in production - this is for display only
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}

// Main Query Builder Component
const VisualQueryBuilder: React.FC = () => {
  const [query, setQuery] = useState<QueryState>({
    tables: [],
    joins: [],
    orderBy: [],
    limit: 100,
    offset: 0
  });
  const [sqlPreview, setSqlPreview] = useState<string>('');
  const [results, setResults] = useState<any[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  
  const sqlGenerator = useRef(new SQLQueryGenerator()).current;

  const addTable = useCallback((tableName: string, x: number, y: number) => {
    setQuery(prev => ({
      ...prev,
      tables: [...prev.tables, {
        id: `table-${Date.now()}`,
        tableName,
        alias: tableName.charAt(0).toLowerCase(),
        x, y,
        columns: [],
        conditions: [],
        selectedColumns: []
      }]
    }));
  }, []);

  const addCondition = useCallback((tableId: string) => {
    setQuery(prev => ({
      ...prev,
      tables: prev.tables.map(t => 
        t.id === tableId 
          ? { ...t, conditions: [...t.conditions, {
              id: `cond-${Date.now()}`,
              column: '',
              operator: '=' as QueryOperator,
              value: '',
              logicalOperator: 'AND' as const,
              groupId: null
            }]}
          : t
      )
    }));
  }, []);

  const executeQuery = useCallback(async () => {
    const sql = sqlGenerator.generateQuery(query);
    setSqlPreview(sql);
    setIsExecuting(true);
    
    try {
      const response = await fetch('/api/v1/query/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
          'X-Audit-Context': JSON.stringify(getAuditContext())
        },
        body: JSON.stringify({ 
          query: sql,
          parameters: [],
          options: { 
            maxRows: query.limit || 100,
            includeMetadata: true,
            applyFieldMasking: true
          }
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Query execution failed');
      }
      
      const data = await response.json();
      setResults(data.rows);
    } catch (err) {
      console.error('Query execution error:', err);
      // Show error notification
    } finally {
      setIsExecuting(false);
    }
  }, [query, sqlGenerator]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="query-builder-container">
        <QuerySidebar 
          availableTables={[]} 
          onTableDrag={(name) => addTable(name, 100, 100)} 
        />
        <div className="query-canvas">
          {query.tables.map(table => (
            <QueryTableBlock 
              key={table.id}
              table={table}
              onAddCondition={() => addCondition(table.id)}
              onUpdateCondition={(condId, updates) => {
                setQuery(prev => ({
                  ...prev,
                  tables: prev.tables.map(t => 
                    t.id === table.id 
                      ? { ...t, conditions: t.conditions.map(c => 
                          c.id === condId ? { ...c, ...updates } : c
                        )}
                      : t
                  )
                }));
              }}
            />
          ))}
        </div>
        <div className="query-result-panel">
          <QueryToolbar 
            onRun={executeQuery}
            onSave={() => {}}
            onExport={() => {}}
            isExecuting={isExecuting}
          />
          <QueryResultsTable 
            results={results}
            maskedFields={results.length > 0 ? results[0]._metadata?.maskedFields : []}
          />
        </div>
      </div>
    </DndProvider>
  );
};

// Condition Row Component with Filter Chips
const ConditionRow: React.FC<{
  condition: QueryCondition;
  availableColumns: string[];
  onUpdate: (updates: Partial<QueryCondition>) => void;
  onRemove: () => void;
}> = ({ condition, availableColumns, onUpdate, onRemove }) => {
  return (
    <div className="condition-row">
      <select 
        className="field-select"
        value={condition.column}
        onChange={e => onUpdate({ column: e.target.value })}
      >
        <option value="">Select field...</option>
        {availableColumns.map(col => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
      
      <select 
        className="operator-select"
        value={condition.operator}
        onChange={e => onUpdate({ operator: e.target.value as QueryOperator })}
      >
        <option value="=">=</option>
        <option value="!=">!=</option>
        <option value=">">&gt;</option>
        <option value="<">&lt;</option>
        <option value=">=">&gt;=</option>
        <option value="<=">&lt;=</option>
        <option value="IN">in</option>
        <option value="LIKE">like</option>
        <option value="IS_NULL">is null</option>
      </select>
      
      {condition.operator !== 'IS_NULL' && condition.operator !== 'IS_NOT_NULL' && (
        <input 
          className="value-input"
          value={condition.value}
          onChange={e => onUpdate({ value: e.target.value })}
          placeholder="Enter value..."
        />
      )}
      
      <button className="btn-icon btn-danger" onClick={onRemove} title="Remove condition">
        ×
      </button>
    </div>
  );
};
```

### 2.2 Filter Chips/Tags

```typescript
// FilterChipManager.ts
interface ActiveFilter {
  id: string;
  field: string;
  operator: string;
  value: any;
  displayValue: string;
  removable: boolean;
  category: string;  // For color-coding: 'demographic', 'clinical', 'temporal', etc.
}

interface FilterChipProps {
  filter: ActiveFilter;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ filter, onRemove, onEdit }) => {
  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    demographic: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    clinical: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
    temporal: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    medication: { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' },
    lab: { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af' },
    default: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
  };

  const colors = categoryColors[filter.category] || categoryColors.default;

  return (
    <span 
      className="filter-chip"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`
      }}
    >
      <span className="filter-chip-field">{filter.field}</span>
      <span className="filter-chip-operator">{filter.operator}</span>
      <span className="filter-chip-value">{filter.displayValue}</span>
      <button 
        className="filter-chip-remove"
        onClick={() => onRemove(filter.id)}
        aria-label={`Remove filter ${filter.field} ${filter.operator} ${filter.displayValue}`}
      >
        ×
      </button>
    </span>
  );
};
```

```css
/* Filter Chips */
.filter-chips-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.filter-chip:hover {
  filter: brightness(0.95);
  transform: translateY(-1px);
}

.filter-chip-field {
  font-weight: 600;
}

.filter-chip-operator {
  opacity: 0.7;
  font-size: 0.75rem;
}

.filter-chip-value {
  font-style: italic;
}

.filter-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.1);
  color: inherit;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  padding: 0;
  margin-left: 0.125rem;
}

.filter-chip-remove:hover {
  background: rgba(0, 0, 0, 0.2);
}
```

### 2.3 Date Range Pickers

```typescript
// DateRangePicker.tsx
import React, { useState, useCallback } from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

interface DateRangePreset {
  label: string;
  getRange: () => [Date, Date];
}

const DATE_PRESETS: DateRangePreset[] = [
  { 
    label: 'Today', 
    getRange: () => { const d = new Date(); return [d, d]; } 
  },
  { 
    label: 'Yesterday', 
    getRange: () => { 
      const d = new Date(); 
      d.setDate(d.getDate() - 1); 
      return [d, d]; 
    } 
  },
  { 
    label: 'Last 7 Days', 
    getRange: () => { 
      const end = new Date(); 
      const start = new Date(); 
      start.setDate(start.getDate() - 7); 
      return [start, end]; 
    } 
  },
  { 
    label: 'Last 30 Days', 
    getRange: () => { 
      const end = new Date(); 
      const start = new Date(); 
      start.setDate(start.getDate() - 30); 
      return [start, end]; 
    } 
  },
  { 
    label: 'This Month', 
    getRange: () => { 
      const now = new Date(); 
      const start = new Date(now.getFullYear(), now.getMonth(), 1); 
      return [start, now]; 
    } 
  },
  { 
    label: 'Last Month', 
    getRange: () => { 
      const now = new Date(); 
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1); 
      const end = new Date(now.getFullYear(), now.getMonth(), 0); 
      return [start, end]; 
    } 
  },
  { 
    label: 'This Year', 
    getRange: () => { 
      const now = new Date(); 
      const start = new Date(now.getFullYear(), 0, 1); 
      return [start, now]; 
    } 
  },
  { 
    label: 'Last Year', 
    getRange: () => { 
      const now = new Date(); 
      const start = new Date(now.getFullYear() - 1, 0, 1); 
      const end = new Date(now.getFullYear() - 1, 11, 31); 
      return [start, end]; 
    } 
  },
  { 
    label: 'All Time', 
    getRange: () => { 
      return [new Date(1900, 0, 1), new Date()]; 
    } 
  }
];

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (range: [Date | null, Date | null]) => void;
  minDate?: Date;
  maxDate?: Date;
  fieldLabel?: string;
}

const ClinicalDateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  minDate,
  maxDate,
  fieldLabel = 'Date Range'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localStart, setLocalStart] = useState<Date | null>(startDate);
  const [localEnd, setLocalEnd] = useState<Date | null>(endDate);

  const handlePresetSelect = useCallback((preset: DateRangePreset) => {
    const [start, end] = preset.getRange();
    setLocalStart(start);
    setLocalEnd(end);
    onChange([start, end]);
  }, [onChange]);

  const handleApply = useCallback(() => {
    onChange([localStart, localEnd]);
    setIsOpen(false);
  }, [localStart, localEnd, onChange]);

  const formatDateRange = (): string => {
    if (!startDate && !endDate) return 'Select date range...';
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
    return startDate ? fmt(startDate) : `Until ${fmt(endDate!)}`;
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="date-range-picker">
        <div 
          className="date-range-trigger"
          onClick={() => setIsOpen(!isOpen)}
          role="button"
          tabIndex={0}
        >
          <span className="date-range-icon">📅</span>
          <span className="date-range-label">{fieldLabel}:</span>
          <span className="date-range-value">{formatDateRange()}</span>
          <span className="date-range-chevron">{isOpen ? '▲' : '▼'}</span>
        </div>
        
        {isOpen && (
          <div className="date-range-dropdown">
            <div className="date-range-presets">
              {DATE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  className="date-range-preset-btn"
                  onClick={() => handlePresetSelect(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            
            <div className="date-range-inputs">
              <DatePicker
                label="Start Date"
                value={localStart}
                onChange={setLocalStart}
                minDate={minDate}
                maxDate={localEnd || maxDate}
                slotProps={{ textField: { size: 'small' } }}
              />
              <span className="date-range-separator">to</span>
              <DatePicker
                label="End Date"
                value={localEnd}
                onChange={setLocalEnd}
                minDate={localStart || minDate}
                maxDate={maxDate}
                slotProps={{ textField: { size: 'small' } }}
              />
            </div>
            
            <div className="date-range-actions">
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => { setLocalStart(null); setLocalEnd(null); onChange([null, null]); }}
              >
                Clear
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleApply}>
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </LocalizationProvider>
  );
};
```

### 2.4 Full-Text Search

```typescript
// FullTextSearch.ts
interface SearchConfig {
  indexName: string;
  searchableFields: string[];
  highlightFields: string[];
  fuzzyMatching: boolean;
  maxResults: number;
}

interface SearchResult {
  hits: SearchHit[];
  total: number;
  facets: Record<string, FacetResult[]>;
  suggestions: string[];
  executionTimeMs: number;
}

interface SearchHit {
  id: string;
  tableName: string;
  score: number;
  highlights: Record<string, string[]>;
  source: Record<string, any>;
}

class FullTextSearchEngine {
  private client: ElasticsearchClient;

  constructor(config: ElasticsearchConfig) {
    this.client = new ElasticsearchClient(config);
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult> {
    const esQuery = this.buildElasticsearchQuery(query, options);
    
    const response = await this.client.search({
      index: options.indices || ['patients', 'encounters', 'lab_results'],
      body: esQuery
    });

    return {
      hits: response.hits.hits.map(hit => ({
        id: hit._id,
        tableName: hit._index,
        score: hit._score,
        highlights: hit.highlight || {},
        source: hit._source
      })),
      total: response.hits.total.value,
      facets: this.parseFacets(response.aggregations),
      suggestions: this.parseSuggestions(response.suggest),
      executionTimeMs: response.took
    };
  }

  private buildElasticsearchQuery(query: string, options: SearchOptions): any {
    const clauses: any[] = [];

    // Multi-match across all searchable fields
    clauses.push({
      multi_match: {
        query,
        fields: options.fields || ['*'],
        type: 'best_fields',
        fuzziness: options.fuzzy ? 'AUTO' : undefined,
        prefix_length: 2
      }
    });

    // Boost exact phrase matches
    clauses.push({
      match_phrase: {
        _all: {
          query,
          boost: 2.0
        }
      }
    });

    return {
      query: {
        bool: {
          should: clauses,
          filter: this.buildFilters(options.filters)
        }
      },
      highlight: {
        fields: (options.highlightFields || ['*']).reduce((acc, field) => ({
          ...acc,
          [field]: {
            fragment_size: 150,
            number_of_fragments: 3,
            pre_tags: ['<mark class="search-highlight">'],
            post_tags: ['</mark>']
          }
        }), {})
      },
      aggs: this.buildAggregations(options.facets),
      suggest: {
        text: query,
        suggestion: {
          phrase: {
            field: '_all',
            size: 3,
            highlight: {
              pre_tag: '<em>',
              post_tag: '</em>'
            }
          }
        }
      },
      size: options.limit || 25,
      from: options.offset || 0
    };
  }

  private buildFilters(filters?: SearchFilter[]): any[] {
    if (!filters || filters.length === 0) return [];
    return filters.map(f => ({
      term: { [f.field]: f.value }
    }));
  }

  private parseFacets(aggregations?: Record<string, any>): Record<string, FacetResult[]> {
    if (!aggregations) return {};
    // Parse aggregation results into facet format
    return Object.entries(aggregations).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: value.buckets?.map((b: any) => ({
        value: b.key,
        count: b.doc_count
      })) || []
    }), {});
  }

  private parseSuggestions(suggest?: Record<string, any>): string[] {
    if (!suggest?.suggestion) return [];
    return suggest.suggestion[0]?.options?.map((o: any) => o.text) || [];
  }
}
```

### 2.5 Advanced Filters (AND/OR)

```typescript
// AdvancedFilterBuilder.ts
interface FilterGroup {
  id: string;
  logicalOperator: 'AND' | 'OR';
  conditions: FilterCondition[];
  groups: FilterGroup[];  // Nested groups for complex logic
  negate: boolean;        // NOT wrapper
}

interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
  valueType: 'string' | 'number' | 'date' | 'boolean' | 'array';
}

type FilterOperator = 
  | 'equals' | 'not_equals' 
  | 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal'
  | 'contains' | 'starts_with' | 'ends_with'
  | 'in_list' | 'not_in_list'
  | 'between'
  | 'is_empty' | 'is_not_empty'
  | 'matches_regex';

// Converts filter group to SQL WHERE clause
const filterGroupToSQL = (group: FilterGroup, paramOffset: number = 0): { 
  sql: string; 
  params: any[]; 
  nextOffset: number;
} => {
  const parts: string[] = [];
  const params: any[] = [];
  let currentOffset = paramOffset;

  // Process direct conditions
  for (const condition of group.conditions) {
    const { sql, paramCount } = conditionToSQL(condition, currentOffset);
    parts.push(sql);
    currentOffset += paramCount;
  }

  // Process nested groups
  for (const subgroup of group.groups) {
    const result = filterGroupToSQL(subgroup, currentOffset);
    parts.push(`(${result.sql})`);
    currentOffset = result.nextOffset;
  }

  const operator = group.logicalOperator === 'AND' ? ' AND ' : ' OR ';
  let sql = parts.join(operator);
  
  if (group.negate) {
    sql = `NOT (${sql})`;
  }

  return { sql, params, nextOffset: currentOffset };
};

const conditionToSQL = (condition: FilterCondition, offset: number): { 
  sql: string; 
  paramCount: number;
} => {
  const paramRef = `$${offset + 1}`;
  
  switch (condition.operator) {
    case 'equals':
      return { sql: `"${condition.field}" = ${paramRef}`, paramCount: 1 };
    case 'not_equals':
      return { sql: `"${condition.field}" != ${paramRef}`, paramCount: 1 };
    case 'greater_than':
      return { sql: `"${condition.field}" > ${paramRef}`, paramCount: 1 };
    case 'less_than':
      return { sql: `"${condition.field}" < ${paramRef}`, paramCount: 1 };
    case 'greater_or_equal':
      return { sql: `"${condition.field}" >= ${paramRef}`, paramCount: 1 };
    case 'less_or_equal':
      return { sql: `"${condition.field}" <= ${paramRef}`, paramCount: 1 };
    case 'contains':
      return { sql: `"${condition.field}" LIKE '%' || ${paramRef} || '%'`, paramCount: 1 };
    case 'starts_with':
      return { sql: `"${condition.field}" LIKE ${paramRef} || '%'`, paramCount: 1 };
    case 'ends_with':
      return { sql: `"${condition.field}" LIKE '%' || ${paramRef}`, paramCount: 1 };
    case 'in_list':
      const placeholders = (condition.value as any[])
        .map((_, i) => `$${offset + i + 1}`)
        .join(', ');
      return { sql: `"${condition.field}" IN (${placeholders})`, paramCount: (condition.value as any[]).length };
    case 'between':
      return { sql: `"${condition.field}" BETWEEN $${offset + 1} AND $${offset + 2}`, paramCount: 2 };
    case 'is_empty':
      return { sql: `("${condition.field}" IS NULL OR "${condition.field}" = '')`, paramCount: 0 };
    case 'is_not_empty':
      return { sql: `("${condition.field}" IS NOT NULL AND "${condition.field}" != '')`, paramCount: 0 };
    case 'matches_regex':
      return { sql: `"${condition.field}" ~ ${paramRef}`, paramCount: 1 };
    default:
      return { sql: 'TRUE', paramCount: 0 };
  }
};
```

### 2.6 Saved Queries

```typescript
// SavedQueryManager.ts
interface SavedQuery {
  id: string;
  name: string;
  description: string;
  query: QueryState;
  sql: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt: Date | null;
  runCount: number;
  isShared: boolean;
  isTemplate: boolean;
  tags: string[];
  acl: AccessControlEntry[];
}

interface AccessControlEntry {
  principalType: 'user' | 'group' | 'role';
  principalId: string;
  permission: 'read' | 'write' | 'execute' | 'admin';
}

class SavedQueryManager {
  async saveQuery(query: Omit<SavedQuery, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedQuery> {
    // Validate query doesn't contain destructive operations
    this.validateQuerySafety(query.sql);
    
    const response = await fetch('/api/v1/queries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
        'X-Audit-Context': JSON.stringify({
          ...getAuditContext(),
          action: 'SAVE_QUERY',
          queryName: query.name
        })
      },
      body: JSON.stringify({
        ...query,
        sql: query.sql  // Server will re-validate
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save query');
    }
    
    return response.json();
  }

  async listQueries(filters?: QueryListFilters): Promise<SavedQuery[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.tags?.length) params.append('tags', filters.tags.join(','));
    if (filters?.createdBy) params.append('createdBy', filters.createdBy);
    if (filters?.includeShared !== undefined) params.append('includeShared', String(filters.includeShared));
    
    const response = await fetch(`/api/v1/queries?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    
    return response.json();
  }

  async executeSavedQuery(queryId: string, params?: Record<string, any>): Promise<QueryResult> {
    const response = await fetch(`/api/v1/queries/${queryId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
        'X-Audit-Context': JSON.stringify({
          ...getAuditContext(),
          action: 'EXECUTE_SAVED_QUERY',
          queryId
        })
      },
      body: JSON.stringify({ parameters: params })
    });
    
    return response.json();
  }

  private validateQuerySafety(sql: string): void {
    // Prevent destructive operations
    const forbiddenPatterns = [
      /\bDROP\s+/i,
      /\bDELETE\s+(?!FROM\s+\w+\s+WHERE)/i,
      /\bTRUNCATE\s+/i,
      /\bALTER\s+/i,
      /\bCREATE\s+/i,
      /\bGRANT\s+/i,
      /\bREVOKE\s+/i,
      /;/g  // Prevent multiple statements
    ];
    
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(sql)) {
        throw new Error(`Query contains forbidden pattern: ${pattern.source}`);
      }
    }
  }
}
```



---

## 3. Row Viewer

### 3.1 Detail Modal/Panel

The row viewer presents a comprehensive, read-only view of a single record with related data, audit trails, and field-level controls.

#### Wireframe Description

```
+-------------------------------------------------------------+
|  Row Detail - patients #a1b2c3d4               [×] [↗] [⋮] |
+=============================================================+
|  +-------------------+  +---------------------------------+ |
|  | RECORD INFO       |  | FIELD DETAILS                   | |
|  |                   |  |                                 | |
|  | Status: Active    |  | ┌─────────────┐ ┌─────────────┐ | |
|  | Created: 2024-01- |  | │ First Name  │ │ ████ (mask) │ | |
|  | 15 09:30 AM       |  | │ * John      │ │ ●●●●        │ | |
|  |                   |  | │ [PHI]       │ │ [hover to   │ | |
|  | Modified: 2024-03-|  | └─────────────┘ │  reveal]    │ | |
|  | 22 14:15 PM       |  | ┌─────────────┘ └─────────────┘ | |
|  |                   |  | │ Last Name   │ ┌─────────────┐ | |
|  | Created By:       |  | │ ████ (mask) │ │ DOB         │ | |
|  | admin@clinic.com  |  | │ ●●●●        │ │ ████        │ | |
|  |                   |  | │ [PHI]       │ │ 1990-05-15  │ | |
|  | Modified By:      |  | └─────────────┘ │ [PHI] [Q]   │ | |
|  | dr.smith@clinic.  |  | ┌─────────────└ └─────────────┘ | |
|  | com               |  | │ Email       │ ┌─────────────┐ | |
|  |                   |  | │ ███████████ │ │ Phone       │ | |
|  | Version: 12       |  | │ masked@phi. │ │ ███████████ │ | |
|  |                   |  | │ com         │ │ ███████████ │ | |
|  |                   |  | │ [PHI]       │ │ [PHI]       │ | |
|  | [View Audit Log]  |  | └─────────────└ └─────────────┘ | |
|  | [View JSON]       |  | ┌─────────────┐ ┌─────────────┐ | |
|  |                   |  | │ MRN         │ │ Gender      │ | |
|  |                   |  | │ ****-****-  │ │ Male        │ | |
|  |                   |  | │ 4521        │ │ [Non-PHI]   │ | |
|  |                   |  | │ [PHI]       │ │             │ | |
|  |                   |  | └─────────────┘ └─────────────┘ | |
|  +-------------------+  +---------------------------------+ |
+=============================================================+
|  [Fields] [Related Records] [Audit Trail] [JSON View]       |
+-------------------------------------------------------------+
```

#### CSS Pattern

```css
/* Row Detail Modal */
.row-detail-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}

.row-detail-modal {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 1100px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.row-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #ffffff;
}

.row-detail-header-title {
  font-size: 1rem;
  font-weight: 600;
  font-family: 'Inter', system-ui, sans-serif;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.row-detail-header-actions {
  display: flex;
  gap: 0.5rem;
}

.row-detail-header-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  border-radius: 8px;
  padding: 0.375rem 0.625rem;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 0.875rem;
}

.row-detail-header-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.row-detail-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  flex: 1;
  overflow: hidden;
}

.row-detail-sidebar {
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  padding: 1.25rem;
  overflow-y: auto;
}

.row-detail-sidebar-section {
  margin-bottom: 1.5rem;
}

.row-detail-sidebar-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 0.5rem;
}

.row-detail-sidebar-value {
  font-size: 0.875rem;
  color: #1e293b;
  font-weight: 500;
}

.row-detail-content {
  padding: 1.5rem;
  overflow-y: auto;
}

/* Field Card */
.field-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  transition: all 0.2s ease;
  position: relative;
}

.field-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.field-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.field-card-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}

.field-card-value {
  font-size: 0.9375rem;
  color: #1e293b;
  font-weight: 500;
  word-break: break-word;
}

.field-card-value.masked {
  font-family: 'Courier New', monospace;
  letter-spacing: 0.15em;
  color: #94a3b8;
  cursor: help;
  user-select: none;
}

.field-card-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

/* Tab Navigation */
.row-detail-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 1.5rem;
  background: #f8fafc;
}

.row-detail-tab {
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #64748b;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  position: relative;
}

.row-detail-tab:hover {
  color: #334155;
  background: rgba(255, 255, 255, 0.5);
}

.row-detail-tab.active {
  color: #1e40af;
  border-bottom-color: #3b82f6;
  font-weight: 600;
}

.row-detail-tab .badge {
  position: absolute;
  top: 0.375rem;
  right: 0.125rem;
  background: #ef4444;
  color: #ffffff;
  font-size: 0.625rem;
  padding: 0.0625rem 0.3125rem;
  border-radius: 9999px;
  font-weight: 600;
}
```

#### JavaScript Implementation Pattern

```typescript
// RowViewer.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';

interface RowData {
  id: string;
  tableName: string;
  data: Record<string, any>;
  metadata: RowMetadata;
  relatedRecords: RelatedRecord[];
  auditTrail: AuditEntry[];
}

interface RowMetadata {
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  maskedFields: string[];
  phiFields: string[];
  fieldPermissions: Record<string, FieldPermission>;
}

interface FieldPermission {
  canView: boolean;
  canExport: boolean;
  maskDisplay: boolean;
  maskExport: boolean;
}

interface RelatedRecord {
  tableName: string;
  displayName: string;
  records: any[];
  relationshipType: string;
  count: number;
}

interface AuditEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW';
  timestamp: Date;
  userId: string;
  userName: string;
  changes: FieldChange[];
  ipAddress: string;
  userAgent: string;
}

interface FieldChange {
  fieldName: string;
  oldValue: any;
  newValue: any;
  masked: boolean;
}

type DetailTab = 'fields' | 'related' | 'audit' | 'json';

const RowViewer: React.FC<{
  tableName: string;
  rowId: string;
  onClose: () => void;
}> = ({ tableName, rowId, onClose }) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('fields');
  const [rowData, setRowData] = useState<RowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRowData();
  }, [tableName, rowId]);

  const loadRowData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/tables/${tableName}/rows/${rowId}`, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'X-Audit-Context': JSON.stringify({
            ...getAuditContext(),
            action: 'VIEW_ROW',
            tableName,
            rowId
          })
        }
      });
      
      if (!response.ok) throw new Error('Failed to load row data');
      
      const data = await response.json();
      setRowData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleFieldReveal = useCallback((fieldName: string) => {
    setRevealedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
      } else {
        next.add(fieldName);
      }
      return next;
    });
  }, []);

  if (loading) return <RowViewerSkeleton />;
  if (error) return <RowViewerError message={error} onRetry={loadRowData} />;
  if (!rowData) return null;

  return (
    <div className="row-detail-overlay" onClick={onClose}>
      <div className="row-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="row-detail-header">
          <span className="row-detail-header-title">
            <span>📄</span>
            {rowData.tableName} <code style={{ opacity: 0.7 }}>#{rowId.slice(0, 8)}</code>
          </span>
          <div className="row-detail-header-actions">
            <button className="row-detail-header-btn" title="Open in new tab">↗</button>
            <button className="row-detail-header-btn" title="More options">⋮</button>
            <button className="row-detail-header-btn" onClick={onClose} title="Close">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="row-detail-tabs">
          <button 
            className={`row-detail-tab ${activeTab === 'fields' ? 'active' : ''}`}
            onClick={() => setActiveTab('fields')}
          >
            Fields
          </button>
          <button 
            className={`row-detail-tab ${activeTab === 'related' ? 'active' : ''}`}
            onClick={() => setActiveTab('related')}
          >
            Related Records
            {rowData.relatedRecords.length > 0 && (
              <span className="badge">{rowData.relatedRecords.length}</span>
            )}
          </button>
          <button 
            className={`row-detail-tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            Audit Trail
          </button>
          <button 
            className={`row-detail-tab ${activeTab === 'json' ? 'active' : ''}`}
            onClick={() => setActiveTab('json')}
          >
            JSON
          </button>
        </div>

        {/* Body */}
        <div className="row-detail-body">
          {/* Sidebar */}
          <div className="row-detail-sidebar">
            <div className="row-detail-sidebar-section">
              <div className="row-detail-sidebar-label">Status</div>
              <div className="row-detail-sidebar-value">
                <StatusBadge status="active" />
              </div>
            </div>
            <div className="row-detail-sidebar-section">
              <div className="row-detail-sidebar-label">Created</div>
              <div className="row-detail-sidebar-value">
                {format(new Date(rowData.metadata.createdAt), 'MMM d, yyyy HH:mm')}
              </div>
            </div>
            <div className="row-detail-sidebar-section">
              <div className="row-detail-sidebar-label">Modified</div>
              <div className="row-detail-sidebar-value">
                {format(new Date(rowData.metadata.updatedAt), 'MMM d, yyyy HH:mm')}
              </div>
            </div>
            <div className="row-detail-sidebar-section">
              <div className="row-detail-sidebar-label">Created By</div>
              <div className="row-detail-sidebar-value">{rowData.metadata.createdBy}</div>
            </div>
            <div className="row-detail-sidebar-section">
              <div className="row-detail-sidebar-label">Version</div>
              <div className="row-detail-sidebar-value">v{rowData.metadata.version}</div>
            </div>
            <div className="row-detail-sidebar-section">
              <div className="row-detail-sidebar-label">PHI Fields</div>
              <div className="row-detail-sidebar-value">
                {rowData.metadata.phiFields.length} classified
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="row-detail-content">
            {activeTab === 'fields' && (
              <FieldsTab 
                data={rowData.data}
                metadata={rowData.metadata}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
              />
            )}
            {activeTab === 'related' && (
              <RelatedRecordsTab records={rowData.relatedRecords} />
            )}
            {activeTab === 'audit' && (
              <AuditTrailTab entries={rowData.auditTrail} />
            )}
            {activeTab === 'json' && (
              <JsonViewTab data={rowData.data} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Fields Tab Component
const FieldsTab: React.FC<{
  data: Record<string, any>;
  metadata: RowMetadata;
  revealedFields: Set<string>;
  onToggleReveal: (field: string) => void;
}> = ({ data, metadata, revealedFields, onToggleReveal }) => {
  return (
    <div className="fields-grid">
      {Object.entries(data).map(([fieldName, value]) => {
        const isMasked = metadata.maskedFields.includes(fieldName);
        const isRevealed = revealedFields.has(fieldName);
        const isPhi = metadata.phiFields.includes(fieldName);
        const permission = metadata.fieldPermissions[fieldName];

        return (
          <FieldCard
            key={fieldName}
            fieldName={fieldName}
            value={value}
            isMasked={isMasked && !isRevealed}
            isPhi={isPhi}
            permission={permission}
            onToggleReveal={() => onToggleReveal(fieldName)}
          />
        );
      })}
    </div>
  );
};

const FieldCard: React.FC<{
  fieldName: string;
  value: any;
  isMasked: boolean;
  isPhi: boolean;
  permission: FieldPermission;
  onToggleReveal: () => void;
}> = ({ fieldName, value, isMasked, isPhi, permission, onToggleReveal }) => {
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '—';
    if (val instanceof Date) return format(val, 'MMM d, yyyy HH:mm:ss');
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div className="field-card">
      <div className="field-card-header">
        <span className="field-card-label">{fieldName}</span>
        <div className="field-card-tags">
          {isPhi && <PHIBadge classification="direct" />}
          {isMasked && permission.canView && (
            <button 
              className="btn-reveal"
              onClick={onToggleReveal}
              title="Click to reveal"
            >
              👁
            </button>
          )}
        </div>
      </div>
      <div className={`field-card-value ${isMasked ? 'masked' : ''}`}>
        {isMasked ? '●●●●●●●●' : formatValue(value)}
      </div>
    </div>
  );
};
```

### 3.2 Field-Level Masking Indicators

```typescript
// MaskingIndicator.tsx
interface MaskingIndicatorProps {
  fieldName: string;
  phiClassification: 'direct' | 'quasi' | 'sensitive' | 'non-phi';
  maskingPolicy: 'full' | 'partial' | 'hash' | 'none';
  userRole: string;
  canReveal: boolean;
  isRevealed: boolean;
  onReveal: () => void;
  onHide: () => void;
}

const MaskingIndicator: React.FC<MaskingIndicatorProps> = ({
  fieldName,
  phiClassification,
  maskingPolicy,
  canReveal,
  isRevealed,
  onReveal,
  onHide
}) => {
  const classificationConfig = {
    direct: { color: '#dc2626', bg: '#fee2e2', label: 'Direct PHI', icon: '🔴' },
    quasi: { color: '#d97706', bg: '#fef3c7', label: 'Quasi-ID', icon: '🟡' },
    sensitive: { color: '#7c3aed', bg: '#ede9fe', label: 'Sensitive', icon: '🟣' },
    'non-phi': { color: '#16a34a', bg: '#dcfce7', label: 'Non-PHI', icon: '🟢' }
  };

  const config = classificationConfig[phiClassification];

  return (
    <div className="masking-indicator-container">
      <span 
        className="phi-badge"
        style={{ 
          backgroundColor: config.bg, 
          color: config.color,
          border: `1px solid ${config.color}33`
        }}
        title={config.label}
      >
        {config.icon} {config.label}
      </span>
      
      {maskingPolicy !== 'none' && (
        <span className="masking-badge" title={`Masked: ${maskingPolicy}`}>
          🔒 {maskingPolicy}
        </span>
      )}
      
      {canReveal && maskingPolicy !== 'none' && (
        <button 
          className="reveal-toggle-btn"
          onClick={isRevealed ? onHide : onReveal}
          title={isRevealed ? 'Click to hide' : 'Click to reveal'}
        >
          {isRevealed ? '🙈 Hide' : '👁 Reveal'}
        </button>
      )}
    </div>
  );
};
```

```css
/* Masking Indicators */
.masking-indicator-container {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.phi-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
}

.masking-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
  background: #f1f5f9;
  color: #475569;
}

.reveal-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reveal-toggle-btn:hover {
  background: #dbeafe;
}

.btn-reveal {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.125rem;
  font-size: 0.875rem;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}

.btn-reveal:hover {
  opacity: 1;
}

/* Fields Grid */
.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.875rem;
}
```

### 3.3 Related Records

```typescript
// RelatedRecords.tsx
const RelatedRecordsTab: React.FC<{ records: RelatedRecord[] }> = ({ records }) => {
  return (
    <div className="related-records-container">
      {records.length === 0 ? (
        <EmptyState message="No related records found" icon="🔗" />
      ) : (
        records.map(group => (
          <RelatedRecordGroup key={group.tableName} group={group} />
        ))
      )}
    </div>
  );
};

const RelatedRecordGroup: React.FC<{ group: RelatedRecord }> = ({ group }) => {
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const totalPages = Math.ceil(group.count / pageSize);
  const displayedRecords = group.records.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="related-record-group">
      <button 
        className="related-record-group-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="related-record-group-chevron">
          {expanded ? '▼' : '▶'}
        </span>
        <span className="related-record-group-title">
          {group.displayName}
        </span>
        <span className="related-record-group-badge">
          {group.count} {group.count === 1 ? 'record' : 'records'}
        </span>
        <span className="related-record-group-type">
          {group.relationshipType}
        </span>
      </button>
      
      {expanded && (
        <div className="related-record-group-content">
          <table className="related-records-table">
            <thead>
              <tr>
                {displayedRecords.length > 0 && 
                  Object.keys(displayedRecords[0]).map(key => (
                    <th key={key}>{key}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {displayedRecords.map((record, idx) => (
                <tr key={idx}>
                  {Object.values(record).map((val, vidx) => (
                    <td key={vidx}>
                      {val === null ? '—' : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <Pagination 
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  );
};
```

```css
.related-records-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.related-record-group {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.related-record-group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border: none;
  width: 100%;
  cursor: pointer;
  font-size: 0.875rem;
  text-align: left;
  transition: background-color 0.15s ease;
}

.related-record-group-header:hover {
  background: #f1f5f9;
}

.related-record-group-title {
  font-weight: 600;
  color: #1e293b;
  flex: 1;
}

.related-record-group-badge {
  background: #e2e8f0;
  color: #475569;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.related-record-group-type {
  font-size: 0.75rem;
  color: #94a3b8;
}

.related-record-group-content {
  padding: 1rem;
}

.related-records-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.related-records-table th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
}

.related-records-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
```

### 3.4 Audit Trail Per Row

```typescript
// AuditTrail.tsx
const AuditTrailTab: React.FC<{ entries: AuditEntry[] }> = ({ entries }) => {
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const getActionColor = (action: AuditEntry['action']) => {
    switch (action) {
      case 'CREATE': return { bg: '#dcfce7', text: '#166534', icon: '✚' };
      case 'UPDATE': return { bg: '#dbeafe', text: '#1e40af', icon: '✎' };
      case 'DELETE': return { bg: '#fee2e2', text: '#dc2626', icon: '🗑' };
      case 'VIEW': return { bg: '#f1f5f9', text: '#475569', icon: '👁' };
    }
  };

  return (
    <div className="audit-trail-container">
      {entries.length === 0 ? (
        <EmptyState message="No audit entries for this record" icon="📋" />
      ) : (
        <div className="audit-timeline">
          {entries.map((entry, idx) => {
            const colors = getActionColor(entry.action);
            return (
              <div key={entry.id} className="audit-timeline-item">
                <div className="audit-timeline-connector">
                  <div 
                    className="audit-timeline-dot"
                    style={{ backgroundColor: colors.bg, borderColor: colors.text }}
                  >
                    <span>{colors.icon}</span>
                  </div>
                  {idx < entries.length - 1 && (
                    <div className="audit-timeline-line" />
                  )}
                </div>
                
                <div className="audit-timeline-content">
                  <div className="audit-timeline-header">
                    <span 
                      className="audit-action-badge"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {entry.action}
                    </span>
                    <span className="audit-timestamp">
                      {format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm:ss')}
                    </span>
                  </div>
                  
                  <div className="audit-timeline-meta">
                    <span>👤 {entry.userName}</span>
                    <span>🌐 {entry.ipAddress}</span>
                  </div>
                  
                  {entry.changes.length > 0 && (
                    <div className="audit-changes">
                      <button 
                        className="audit-changes-toggle"
                        onClick={() => setSelectedEntry(
                          selectedEntry?.id === entry.id ? null : entry
                        )}
                      >
                        {selectedEntry?.id === entry.id ? '▼' : '▶'} 
                        {entry.changes.length} field{entry.changes.length !== 1 ? 's' : ''} changed
                      </button>
                      
                      {selectedEntry?.id === entry.id && (
                        <table className="audit-changes-table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Previous</th>
                              <th>New</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.changes.map((change, cidx) => (
                              <tr key={cidx}>
                                <td className="audit-change-field">{change.fieldName}</td>
                                <td className="audit-change-old">
                                  {change.masked ? '●●●●' : String(change.oldValue ?? '—')}
                                </td>
                                <td className="audit-change-new">
                                  {change.masked ? '●●●●' : String(change.newValue ?? '—')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
```

```css
/* Audit Trail */
.audit-trail-container {
  padding: 0.5rem 0;
}

.audit-timeline {
  position: relative;
}

.audit-timeline-item {
  display: flex;
  gap: 1rem;
  padding-bottom: 1.5rem;
}

.audit-timeline-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.audit-timeline-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}

.audit-timeline-line {
  width: 2px;
  flex: 1;
  background: #e2e8f0;
  margin-top: 0.5rem;
}

.audit-timeline-content {
  flex: 1;
  min-width: 0;
  padding-top: 0.25rem;
}

.audit-timeline-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.375rem;
}

.audit-action-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.audit-timestamp {
  font-size: 0.8125rem;
  color: #94a3b8;
}

.audit-timeline-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.8125rem;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.audit-changes {
  margin-top: 0.5rem;
}

.audit-changes-toggle {
  background: none;
  border: none;
  color: #2563eb;
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0;
  font-weight: 500;
}

.audit-changes-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
}

.audit-changes-table th {
  text-align: left;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 600;
  color: #64748b;
  font-size: 0.6875rem;
  text-transform: uppercase;
}

.audit-changes-table td {
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.audit-change-field {
  font-weight: 500;
  color: #1e293b;
  font-family: monospace;
  font-size: 0.8125rem;
}

.audit-change-old {
  color: #dc2626;
  text-decoration: line-through;
}

.audit-change-new {
  color: #16a34a;
  font-weight: 500;
}
```

### 3.5 JSON/Raw View Toggle

```typescript
// JsonView.tsx
import React, { useState } from 'react';

const JsonViewTab: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const [showTypes, setShowTypes] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const togglePath = (path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filteredData = searchTerm 
    ? filterJsonByKey(data, searchTerm.toLowerCase())
    : data;

  return (
    <div className="json-view-container">
      <div className="json-view-toolbar">
        <div className="json-view-search">
          <input
            type="text"
            placeholder="Search keys..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="json-search-input"
          />
        </div>
        <div className="json-view-actions">
          <button 
            className={`json-view-toggle ${showTypes ? 'active' : ''}`}
            onClick={() => setShowTypes(!showTypes)}
          >
            {showTypes ? 'Hide Types' : 'Show Types'}
          </button>
          <button 
            className="json-view-toggle"
            onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
          >
            📋 Copy
          </button>
          <button 
            className="json-view-toggle"
            onClick={() => downloadJson(data, `record-${data.id}.json`)}
          >
            ⬇ Download
          </button>
        </div>
      </div>
      
      <pre className="json-view">
        <JsonTree 
          data={filteredData} 
          path="" 
          depth={0}
          collapsedPaths={collapsedPaths}
          onToggle={togglePath}
          showTypes={showTypes}
          searchTerm={searchTerm}
        />
      </pre>
    </div>
  );
};

const JsonTree: React.FC<{
  data: any;
  path: string;
  depth: number;
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  showTypes: boolean;
  searchTerm: string;
}> = ({ data, path, depth, collapsedPaths, onToggle, showTypes, searchTerm }) => {
  const indent = '  '.repeat(depth);
  
  if (data === null) return <span className="json-null">null</span>;
  if (typeof data === 'boolean') return <span className="json-boolean">{String(data)}</span>;
  if (typeof data === 'number') return <span className="json-number">{data}</span>;
  if (typeof data === 'string') {
    const isHighlighted = searchTerm && data.toLowerCase().includes(searchTerm);
    return (
      <span className={`json-string ${isHighlighted ? 'json-highlighted' : ''}`}>
        "{data.length > 100 ? data.slice(0, 100) + '...' : data}"
      </span>
    );
  }
  
  if (Array.isArray(data)) {
    const isCollapsed = collapsedPaths.has(path);
    return (
      <span>
        <span 
          className="json-toggle"
          onClick={() => onToggle(path)}
        >
          {isCollapsed ? '▶' : '▼'}
        </span>
        <span className="json-bracket">[</span>
        {showTypes && <span className="json-type">Array({data.length})</span>}
        {isCollapsed ? (
          <span className="json-ellipsis">...{data.length} items</span>
        ) : (
          <>
            {'\n'}
            {data.map((item, idx) => (
              <div key={idx}>
                {indent}  
                <JsonTree 
                  data={item} 
                  path={`${path}[${idx}]`}
                  depth={depth + 1}
                  collapsedPaths={collapsedPaths}
                  onToggle={onToggle}
                  showTypes={showTypes}
                  searchTerm={searchTerm}
                />
                {idx < data.length - 1 ? ',' : ''}
              </div>
            ))}
            {'\n'}{indent}
          </>
        )}
        <span className="json-bracket">]</span>
      </span>
    );
  }
  
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    const isCollapsed = collapsedPaths.has(path);
    return (
      <span>
        <span 
          className="json-toggle"
          onClick={() => onToggle(path)}
        >
          {isCollapsed ? '▶' : '▼'}
        </span>
        <span className="json-bracket">{'{'}</span>
        {showTypes && <span className="json-type">Object({keys.length})</span>}
        {isCollapsed ? (
          <span className="json-ellipsis">...{keys.length} keys</span>
        ) : (
          <>
            {'\n'}
            {keys.map((key, idx) => {
              const isKeyHighlighted = searchTerm && key.toLowerCase().includes(searchTerm);
              return (
                <div key={key}>
                  {indent}  
                  <span className={`json-key ${isKeyHighlighted ? 'json-highlighted' : ''}`}>
                    "{key}"
                  </span>
                  <span className="json-colon">: </span>
                  <JsonTree 
                    data={data[key]} 
                    path={path ? `${path}.${key}` : key}
                    depth={depth + 1}
                    collapsedPaths={collapsedPaths}
                    onToggle={onToggle}
                    showTypes={showTypes}
                    searchTerm={searchTerm}
                  />
                  {idx < keys.length - 1 ? ',' : ''}
                </div>
              );
            })}
            {'\n'}{indent}
          </>
        )}
        <span className="json-bracket">{'}'}</span>
      </span>
    );
  }
  
  return <span>{String(data)}</span>;
};

const filterJsonByKey = (obj: any, term: string): any => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => filterJsonByKey(item, term));
  }
  
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase().includes(term)) {
      filtered[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      const nested = filterJsonByKey(value, term);
      if (Object.keys(nested).length > 0) {
        filtered[key] = nested;
      }
    } else if (String(value).toLowerCase().includes(term)) {
      filtered[key] = value;
    }
  }
  return filtered;
};

const downloadJson = (data: any, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
```

```css
/* JSON View */
.json-view-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.json-view-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 0.75rem;
}

.json-search-input {
  padding: 0.375rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.8125rem;
  width: 240px;
}

.json-search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.json-view-actions {
  display: flex;
  gap: 0.5rem;
}

.json-view-toggle {
  padding: 0.375rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.json-view-toggle:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.json-view-toggle.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #2563eb;
}

.json-view {
  flex: 1;
  overflow: auto;
  font-family: 'Fira Code', 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: #334155;
  background: #fafafa;
  padding: 1rem;
  border-radius: 8px;
  margin: 0;
}

.json-toggle {
  cursor: pointer;
  color: #94a3b8;
  font-size: 0.625rem;
  margin-right: 0.25rem;
  user-select: none;
}

.json-toggle:hover {
  color: #475569;
}

.json-key { color: #1e40af; font-weight: 500; }
.json-string { color: #16a34a; }
.json-number { color: #d97706; }
.json-boolean { color: #2563eb; font-weight: 600; }
.json-null { color: #94a3b8; font-style: italic; }
.json-bracket { color: #64748b; }
.json-colon { color: #64748b; }
.json-ellipsis { color: #94a3b8; font-style: italic; }
.json-type { 
  color: #94a3b8; 
  font-size: 0.6875rem; 
  margin-left: 0.25rem;
  font-style: italic;
}
.json-highlighted {
  background: #fef3c7;
  border-radius: 2px;
}
```

---

## 4. Schema Browser

### 4.1 Table Relationships

Visual diagram showing all foreign key relationships between tables.

#### Wireframe Description

```
+-------------------------------------------------------------+
|  Schema Browser                                    [◀] [▶]   |
+-------------------------------------------------------------+
|  Search: [search tables...]        View: [Graph ▼] [Zoom]    |
+-------------------------------------------------------------+
|                                                             |
|      +----------+            +----------+                   |
|      | patients |            | providers|                   |
|      |──────────|            |──────────|                   |
|      | id PK    |◄──────────│ provider_│                   |
|      | mrn      │   1:N      │ id PK    │                   |
|      | name     │            │ name     │                   |
|      | dob      │            | specialty│                   |
|      | provider_│            +──────────+                   |
|      │ _id FK   │                                           |
|      +────┬─────+            +──────────────+               |
|           │                  | encounters   │               |
|           │    1:N           │──────────────│               |
|           └─────────────────►│ id PK        │               |
|                              │ patient_id   │               |
|                              │ encounter_da │               |
|                              │ te           │               |
|                              +──────┬───────+               |
|                                     │                        |
|                              1:N    │    N:1                |
|                                     ▼                        |
|                              +──────────────+               |
|                              | lab_results  │               |
|                              │──────────────│               |
|                              │ id PK        │               |
|                              │ encounter_id │               |
|                              │ test_code    │               |
|                              │ result       │               |
|                              +──────────────+               |
|                                                             |
|  Selected: patients                                         |
|  ┌─────────────────────────────────────────────────────┐    |
|  │ patients                                            │    |
|  │ ┌─────────────┬───────────┬─────────────────────────┐│    |
|  │ │ Column      │ Type      │ Constraints             ││    |
|  │ ├─────────────┼───────────┼─────────────────────────┤│    |
|  │ │ id          │ uuid      │ PRIMARY KEY             ││    |
|  │ │ mrn         │ varchar   │ UNIQUE, NOT NULL        ││    |
|  │ │ first_name  │ varchar   │ NOT NULL                ││    |
|  │ │ last_name   │ varchar   │ NOT NULL                ││    |
|  │ │ dob         │ date      │ NOT NULL                ││    |
|  │ │ provider_id │ uuid      │ FK → providers.id       ││    |
|  │ │ created_at  │ timestamp │ DEFAULT now()           ││    |
|  │ └─────────────┴───────────┴─────────────────────────┘│    |
|  └─────────────────────────────────────────────────────┘    |
+-------------------------------------------------------------+
```

#### JavaScript Implementation Pattern

```typescript
// SchemaBrowser.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SchemaGraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columns: SchemaColumn[];
}

interface SchemaGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  relationshipType: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  constraints: string[];
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: { table: string; column: string };
  description: string;
  phiClassification: 'direct' | 'quasi' | 'sensitive' | 'non-phi';
}

const SchemaBrowser: React.FC = () => {
  const [nodes, setNodes] = useState<SchemaGraphNode[]>([]);
  const [edges, setEdges] = useState<SchemaGraphEdge[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    const response = await fetch('/api/v1/schema/graph', {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await response.json();
    
    // Layout nodes using force-directed positioning
    const positioned = layoutGraph(data.nodes, data.edges);
    setNodes(positioned);
    setEdges(data.edges);
  };

  // Force-directed graph layout
  const layoutGraph = (nodes: SchemaGraphNode[], edges: SchemaGraphEdge[]): SchemaGraphNode[] => {
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, x: Math.random() * 800, y: Math.random() * 600 }]));
    
    // Simple force-directed layout iterations
    for (let i = 0; i < 100; i++) {
      // Repulsion between nodes
      for (const a of nodeMap.values()) {
        for (const b of nodeMap.values()) {
          if (a.id === b.id) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.x -= fx;
          a.y -= fy;
          b.x += fx;
          b.y += fy;
        }
      }
      
      // Attraction along edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.x += fx;
        a.y += fy;
        b.x -= fx;
        b.y -= fy;
      }
      
      // Center gravity
      for (const node of nodeMap.values()) {
        node.x += (400 - node.x) * 0.01;
        node.y += (300 - node.y) * 0.01;
      }
    }
    
    return Array.from(nodeMap.values());
  };

  // SVG edge path calculation
  const getEdgePath = (edge: SchemaGraphEdge): string => {
    const source = nodes.find(n => n.id === edge.source);
    const target = nodes.find(n => n.id === edge.target);
    if (!source || !target) return '';
    
    const sx = source.x + source.width / 2;
    const sy = source.y + source.height / 2;
    const tx = target.x + target.width / 2;
    const ty = target.y + target.height / 2;
    
    // Bezier curve
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
  };

  // Mouse pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="schema-browser">
      <div className="schema-toolbar">
        <input 
          type="text" 
          placeholder="Search tables..." 
          className="schema-search"
        />
        <div className="schema-zoom-controls">
          <button onClick={() => setZoom(z => Math.min(z + 0.1, 3))}>+</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.3))}>-</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>⟲</button>
        </div>
      </div>
      
      <div 
        className="schema-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg 
          ref={svgRef}
          width="100%" 
          height="100%"
          viewBox={`${-pan.x} ${-pan.y} ${1200} ${800}`}
          style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" 
              refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
          </defs>
          
          {/* Edges */}
          {edges.map(edge => (
            <g key={edge.id}>
              <path 
                d={getEdgePath(edge)}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray={edge.relationshipType === 'many-to-many' ? '5,5' : 'none'}
                markerEnd="url(#arrowhead)"
              />
              <text 
                x={(nodes.find(n => n.id === edge.source)?.x || 0 + 
                   nodes.find(n => n.id === edge.target)?.x || 0) / 2}
                y={(nodes.find(n => n.id === edge.source)?.y || 0 + 
                   nodes.find(n => n.id === edge.target)?.y || 0) / 2 - 5}
                className="edge-label"
                textAnchor="middle"
              >
                {edge.relationshipType}
              </text>
            </g>
          ))}
          
          {/* Nodes */}
          {nodes.map(node => (
            <g 
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className={`schema-node ${selectedTable === node.id ? 'selected' : ''}`}
              onClick={() => setSelectedTable(node.id)}
            >
              <rect 
                width={node.width} 
                height={node.height}
                rx={8}
                fill={selectedTable === node.id ? '#eff6ff' : '#ffffff'}
                stroke={selectedTable === node.id ? '#3b82f6' : '#cbd5e1'}
                strokeWidth={selectedTable === node.id ? 2 : 1}
              />
              <rect 
                width={node.width} 
                height={28}
                rx={8}
                fill="url(#tableHeaderGradient)"
              />
              <rect 
                width={node.width - 16} 
                height={22}
                x={8} y={3}
                rx={4}
                fill="transparent"
              />
              <text 
                x={node.width / 2} 
                y={19}
                textAnchor="middle"
                className="node-title"
              >
                {node.label}
              </text>
              
              {/* Column list */}
              {node.columns.slice(0, 6).map((col, idx) => (
                <g key={col.name} transform={`translate(10, ${36 + idx * 18})`}>
                  <text className="node-column-name">
                    {col.isPrimaryKey ? '🔑 ' : col.isForeignKey ? '🔗 ' : '  '}
                    {col.name}
                  </text>
                  <text 
                    x={node.width - 20} 
                    textAnchor="end"
                    className="node-column-type"
                  >
                    {col.dataType}
                  </text>
                </g>
              ))}
              
              {node.columns.length > 6 && (
                <text 
                  x={node.width / 2} 
                  y={node.height - 8}
                  textAnchor="middle"
                  className="node-more-columns"
                >
                  +{node.columns.length - 6} more
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      
      {/* Table detail panel */}
      {selectedTable && (
        <SchemaTableDetail 
          table={nodes.find(n => n.id === selectedTable)!}
          onClose={() => setSelectedTable(null)}
        />
      )}
    </div>
  );
};
```

```css
/* Schema Browser */
.schema-browser {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  position: relative;
}

.schema-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.schema-search {
  padding: 0.5rem 1rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.875rem;
  width: 300px;
}

.schema-search:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.schema-zoom-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.schema-zoom-controls button {
  padding: 0.375rem 0.625rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.schema-zoom-controls button:hover {
  background: #f1f5f9;
}

.schema-canvas {
  overflow: hidden;
  cursor: grab;
  background: #f8fafc;
  background-image: 
    radial-gradient(circle, #e2e8f0 1px, transparent 1px);
  background-size: 20px 20px;
}

.schema-canvas:active {
  cursor: grabbing;
}

.schema-node {
  cursor: pointer;
  transition: all 0.2s ease;
}

.schema-node:hover rect:first-child {
  stroke: #3b82f6;
  stroke-width: 2;
  filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.15));
}

.schema-node.selected rect:first-child {
  stroke: #3b82f6;
  stroke-width: 2;
  filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.2));
}

.node-title {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 600;
  fill: #1e293b;
}

.node-column-name {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  fill: #475569;
}

.node-column-type {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  fill: #94a3b8;
  font-style: italic;
}

.node-more-columns {
  font-size: 10px;
  fill: #94a3b8;
  font-style: italic;
}

.edge-label {
  font-size: 10px;
  fill: #64748b;
  background: #ffffff;
}
```

### 4.2 Column Descriptions & Data Types

```typescript
// SchemaTableDetail.tsx
const SchemaTableDetail: React.FC<{
  table: SchemaGraphNode;
  onClose: () => void;
}> = ({ table, onClose }) => {
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterConstraint, setFilterConstraint] = useState<string>('all');

  const sortedColumns = [...table.columns].sort((a, b) => {
    const aVal = a[sortColumn as keyof SchemaColumn];
    const bVal = b[sortColumn as keyof SchemaColumn];
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  const filteredColumns = filterConstraint === 'all' 
    ? sortedColumns 
    : sortedColumns.filter(col => col.constraints.includes(filterConstraint));

  const getTypeColor = (dataType: string): string => {
    if (dataType.includes('uuid')) return '#7c3aed';
    if (dataType.includes('varchar') || dataType.includes('text')) return '#2563eb';
    if (dataType.includes('int') || dataType.includes('numeric') || dataType.includes('float')) return '#d97706';
    if (dataType.includes('timestamp') || dataType.includes('date')) return '#059669';
    if (dataType.includes('bool')) return '#dc2626';
    if (dataType.includes('json')) return '#7c3aed';
    return '#64748b';
  };

  return (
    <div className="schema-detail-panel">
      <div className="schema-detail-header">
        <h3>{table.label}</h3>
        <button onClick={onClose} className="btn-close">×</button>
      </div>
      
      <div className="schema-detail-toolbar">
        <select 
          value={filterConstraint} 
          onChange={e => setFilterConstraint(e.target.value)}
        >
          <option value="all">All Columns</option>
          <option value="PRIMARY KEY">Primary Keys</option>
          <option value="FOREIGN KEY">Foreign Keys</option>
          <option value="UNIQUE">Unique</option>
          <option value="NOT NULL">Required</option>
        </select>
      </div>
      
      <table className="schema-columns-table">
        <thead>
          <tr>
            <th onClick={() => { setSortColumn('name'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}>
              Column {sortColumn === 'name' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th onClick={() => { setSortColumn('dataType'); setSortDirection(d => d === 'asc' ? 'desc' : 'asc'); }}>
              Type {sortColumn === 'dataType' && (sortDirection === 'asc' ? '▲' : '▼')}
            </th>
            <th>Constraints</th>
            <th>PHI</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {filteredColumns.map(col => (
            <tr key={col.name}>
              <td className="col-name">
                {col.isPrimaryKey && <span title="Primary Key">🔑</span>}
                {col.isForeignKey && <span title="Foreign Key">🔗</span>}
                <code>{col.name}</code>
              </td>
              <td>
                <span 
                  className="data-type-badge"
                  style={{ color: getTypeColor(col.dataType), backgroundColor: getTypeColor(col.dataType) + '15' }}
                >
                  {col.dataType}
                </span>
              </td>
              <td>
                <div className="constraints-list">
                  {!col.nullable && <span className="constraint-badge not-null">NOT NULL</span>}
                  {col.constraints.map(c => (
                    <span key={c} className={`constraint-badge ${c.toLowerCase().replace(/\s+/g, '-')}`}>
                      {c}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <PHIBadge classification={col.phiClassification} />
              </td>
              <td className="col-description">{col.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

### 4.3 Constraints & Indexes Display

```typescript
// ConstraintDisplay.tsx
interface TableConstraint {
  name: string;
  type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | 'EXCLUSION';
  columns: string[];
  definition: string;
  referencedTable?: string;
  referencedColumns?: string[];
}

interface TableIndex {
  name: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'spgist' | 'brin';
  isUnique: boolean;
  isPrimary: boolean;
  size: string;
  scans: number;
}

const ConstraintsPanel: React.FC<{
  constraints: TableConstraint[];
}> = ({ constraints }) => {
  const grouped = constraints.reduce((acc, c) => {
    acc[c.type] = acc[c.type] || [];
    acc[c.type].push(c);
    return acc;
  }, {} as Record<string, TableConstraint[]>);

  return (
    <div className="constraints-panel">
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} className="constraint-group">
          <h4 className="constraint-group-title">{type} ({items.length})</h4>
          <div className="constraint-list">
            {items.map(constraint => (
              <div key={constraint.name} className="constraint-item">
                <div className="constraint-name">{constraint.name}</div>
                <div className="constraint-columns">
                  {constraint.columns.map(col => (
                    <code key={col} className="constraint-column">{col}</code>
                  ))}
                </div>
                {constraint.referencedTable && (
                  <div className="constraint-reference">
                    → {constraint.referencedTable}({constraint.referencedColumns?.join(', ')})
                  </div>
                )}
                <div className="constraint-definition">
                  <code>{constraint.definition}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const IndexesPanel: React.FC<{
  indexes: TableIndex[];
}> = ({ indexes }) => {
  return (
    <div className="indexes-panel">
      <table className="indexes-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Columns</th>
            <th>Unique</th>
            <th>Size</th>
            <th>Scans</th>
            <th>Utilization</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map(idx => (
            <tr key={idx.name} className={idx.isPrimary ? 'primary-index' : ''}>
              <td>
                <code>{idx.name}</code>
                {idx.isPrimary && <span className="primary-badge">PRIMARY</span>}
              </td>
              <td><span className={`index-type ${idx.type}`}>{idx.type}</span></td>
              <td>
                {idx.columns.map(col => (
                  <code key={col} className="index-column">{col}</code>
                ))}
              </td>
              <td>{idx.isUnique ? '✓' : '—'}</td>
              <td>{idx.size}</td>
              <td>{idx.scans.toLocaleString()}</td>
              <td>
                <UsageBar value={Math.min(idx.scans / 1000, 1)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const UsageBar: React.FC<{ value: number }> = ({ value }) => {
  const color = value > 0.7 ? '#22c55e' : value > 0.3 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="usage-bar">
      <div 
        className="usage-bar-fill"
        style={{ width: `${value * 100}%`, backgroundColor: color }}
      />
    </div>
  );
};
```

```css
/* Schema Detail Panel */
.schema-detail-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 480px;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
  overflow-y: auto;
  z-index: 10;
}

.schema-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.schema-detail-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
}

.schema-detail-toolbar {
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
}

.schema-detail-toolbar select {
  padding: 0.375rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.8125rem;
}

/* Constraints */
.constraints-panel {
  padding: 1rem 1.25rem;
}

.constraint-group {
  margin-bottom: 1.5rem;
}

.constraint-group-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.75rem;
}

.constraint-item {
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  background: #fafafa;
}

.constraint-name {
  font-family: 'Fira Code', monospace;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #1e293b;
  margin-bottom: 0.25rem;
}

.constraint-columns {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}

.constraint-column {
  padding: 0.125rem 0.375rem;
  background: #e2e8f0;
  border-radius: 4px;
  font-size: 0.75rem;
}

.constraint-reference {
  font-size: 0.8125rem;
  color: #2563eb;
  margin-bottom: 0.25rem;
}

.constraint-definition code {
  font-size: 0.75rem;
  color: #64748b;
}

/* Indexes */
.indexes-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.indexes-table th {
  text-align: left;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 600;
  color: #64748b;
  font-size: 0.6875rem;
  text-transform: uppercase;
}

.indexes-table td {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.primary-index {
  background: #eff6ff;
}

.primary-badge {
  margin-left: 0.5rem;
  padding: 0.0625rem 0.375rem;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 600;
}

.index-type {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.index-type.btree { background: #dbeafe; color: #1e40af; }
.index-type.hash { background: #dcfce7; color: #166534; }
.index-type.gin { background: #fef3c7; color: #92400e; }
.index-type.gist { background: #f3e8ff; color: #6b21a8; }

.index-column {
  margin-right: 0.375rem;
  padding: 0.125rem 0.375rem;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 0.75rem;
}

.usage-bar {
  width: 60px;
  height: 6px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.usage-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.3s ease;
}
```

### 4.4 Foreign Key Chains

```typescript
// ForeignKeyChainExplorer.ts
interface FKChainNode {
  table: string;
  column: string;
  constraintName: string;
  direction: 'forward' | 'backward';
  depth: number;
}

interface FKChain {
  path: FKChainNode[];
  totalDepth: number;
  cycles: boolean;
}

class ForeignKeyChainExplorer {
  async findChainsFromTable(
    startTable: string, 
    maxDepth: number = 5
  ): Promise<FKChain[]> {
    const chains: FKChain[] = [];
    const visited = new Set<string>();
    
    const dfs = async (
      currentTable: string, 
      path: FKChainNode[], 
      depth: number
    ) => {
      if (depth > maxDepth) return;
      if (visited.has(currentTable) && depth > 0) {
        // Found a cycle
        chains.push({ path: [...path], totalDepth: depth, cycles: true });
        return;
      }
      
      visited.add(currentTable);
      
      // Get outgoing FKs
      const outgoingFKs = await this.getForeignKeys(currentTable, 'outgoing');
      for (const fk of outgoingFKs) {
        const node: FKChainNode = {
          table: fk.referencedTable,
          column: fk.referencedColumn,
          constraintName: fk.constraintName,
          direction: 'forward',
          depth
        };
        path.push(node);
        await dfs(fk.referencedTable, path, depth + 1);
        path.pop();
      }
      
      // Get incoming FKs
      const incomingFKs = await this.getForeignKeys(currentTable, 'incoming');
      for (const fk of incomingFKs) {
        const node: FKChainNode = {
          table: fk.sourceTable,
          column: fk.sourceColumn,
          constraintName: fk.constraintName,
          direction: 'backward',
          depth
        };
        path.push(node);
        await dfs(fk.sourceTable, path, depth + 1);
        path.pop();
      }
      
      if (outgoingFKs.length === 0 && incomingFKs.length === 0 && path.length > 1) {
        chains.push({ path: [...path], totalDepth: depth, cycles: false });
      }
    };
    
    await dfs(startTable, [], 0);
    return chains;
  }

  private async getForeignKeys(
    table: string, 
    direction: 'outgoing' | 'incoming'
  ): Promise<any[]> {
    if (direction === 'outgoing') {
      const query = `
        SELECT 
          tc.constraint_name,
          kcu.column_name as source_column,
          ccu.table_name as referenced_table,
          ccu.column_name as referenced_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu 
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = $1
      `;
      const result = await db.query(query, [table]);
      return result.rows;
    } else {
      const query = `
        SELECT 
          tc.constraint_name,
          kcu.column_name as source_column,
          tc.table_name as source_table,
          kcu.table_name as referenced_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND ccu.table_name = $1
      `;
      const result = await db.query(query, [table]);
      return result.rows;
    }
  }
}
```



---

## 5. Field Masking Display

### 5.1 Visual Indicators for Masked Fields

Field masking requires clear, consistent visual indicators that immediately communicate to users which fields contain protected health information and what level of masking is applied.

#### CSS Pattern

```css
/* Base Masking Styles */
.masked-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.masked-field-value {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  color: #94a3b8;
  letter-spacing: 0.12em;
  user-select: none;
  background: linear-gradient(
    90deg,
    #e2e8f0 0%, #e2e8f0 20%,
    transparent 20%, transparent 40%,
    #e2e8f0 40%, #e2e8f0 60%,
    transparent 60%, transparent 80%,
    #e2e8f0 80%, #e2e8f0 100%
  );
  background-size: 8px 100%;
  -webkit-background-clip: text;
  background-clip: text;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  min-width: 60px;
}

.masked-field-value.partial {
  background: linear-gradient(
    90deg,
    #1e293b 0%, #1e293b 30%,
    #e2e8f0 30%, #e2e8f0 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.masked-field-value.hashed {
  font-size: 0.75rem;
  color: #a855f7;
  background: #f3e8ff;
  letter-spacing: 0;
}

/* PHI Classification Badges */
.phi-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.phi-badge.direct {
  background-color: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.phi-badge.direct::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #dc2626;
  display: inline-block;
}

.phi-badge.quasi {
  background-color: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.phi-badge.quasi::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #f59e0b;
  display: inline-block;
}

.phi-badge.sensitive {
  background-color: #ede9fe;
  color: #6b21a8;
  border: 1px solid #ddd6fe;
}

.phi-badge.sensitive::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #8b5cf6;
  display: inline-block;
}

.phi-badge.non-phi {
  background-color: #dcfce7;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.phi-badge.non-phi::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #22c55e;
  display: inline-block;
}

/* Masked Cell in Data Grid */
.data-grid-cell.masked {
  position: relative;
}

.data-grid-cell.masked::after {
  content: '🔒';
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.625rem;
  opacity: 0.4;
}

.data-grid-cell.masked:hover::after {
  opacity: 0.7;
}

/* Table Column Header PHI Indicator */
.column-header-phi {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.column-header-phi-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.column-header-phi-indicator.direct { background-color: #dc2626; }
.column-header-phi-indicator.quasi { background-color: #f59e0b; }
.column-header-phi-indicator.sensitive { background-color: #8b5cf6; }

/* Masking Legend */
.masking-legend {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  font-size: 0.75rem;
  color: #64748b;
}

.masking-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

/* Hover Reveal Overlay */
.reveal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(30, 41, 59, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.masked-field:hover .reveal-overlay {
  opacity: 1;
}

.reveal-overlay-content {
  color: #ffffff;
  font-size: 0.8125rem;
  text-align: center;
  padding: 0.5rem;
}

.reveal-overlay-content .reveal-hint {
  font-size: 0.6875rem;
  opacity: 0.7;
  margin-top: 0.25rem;
}
```

#### JavaScript Implementation Pattern

```typescript
// FieldMasking.ts
import React, { useState, useCallback, useRef, useEffect } from 'react';

export type MaskingType = 'full' | 'partial' | 'hash' | 'nullify' | 'role_based';
export type PHIClassification = 'direct' | 'quasi' | 'sensitive' | 'non-phi';

interface FieldMaskingConfig {
  fieldName: string;
  phiClassification: PHIClassification;
  maskingType: MaskingType;
  maskingRule: string;
  allowedRoles: string[];
  revealOnHover: boolean;
  auditReveal: boolean;
  exportMasking: MaskingType;
}

interface MaskedFieldProps {
  value: any;
  config: FieldMaskingConfig;
  userRole: string;
  userId: string;
  tableName: string;
  recordId: string;
}

class FieldMaskingEngine {
  private configs: Map<string, FieldMaskingConfig> = new Map();
  private revealLog: Array<{
    fieldName: string;
    userId: string;
    userRole: string;
    timestamp: Date;
    tableName: string;
    recordId: string;
  }> = [];

  registerConfig(config: FieldMaskingConfig): void {
    this.configs.set(config.fieldName, config);
  }

  canReveal(config: FieldMaskingConfig, userRole: string): boolean {
    return config.allowedRoles.includes(userRole) || config.allowedRoles.includes('*');
  }

  applyMask(value: any, config: FieldMaskingConfig): string {
    if (value === null || value === undefined) return '';
    
    const strValue = String(value);
    
    switch (config.maskingType) {
      case 'full':
        return '●'.repeat(Math.min(strValue.length, 12));
      
      case 'partial':
        if (strValue.length <= 4) return '●'.repeat(strValue.length);
        const visible = Math.ceil(strValue.length * 0.25);
        return strValue.slice(0, visible) + '●'.repeat(strValue.length - visible);
      
      case 'hash':
        return this.hashValue(strValue);
      
      case 'nullify':
        return '[REDACTED]';
      
      case 'role_based':
        return '[RESTRICTED]';
      
      default:
        return strValue;
    }
  }

  applyPartialMask(value: string, visibleStart: number = 0, visibleEnd: number = 0): string {
    const visible = value.slice(0, visibleStart) + value.slice(-visibleEnd);
    const masked = '●'.repeat(value.length - visibleStart - visibleEnd);
    return value.slice(0, visibleStart) + masked + (visibleEnd > 0 ? value.slice(-visibleEnd) : '');
  }

  private hashValue(value: string): string {
    // In production, use a proper hash function
    // This is a simplified placeholder
    return `[SHA256:${btoa(value).slice(0, 16)}...]`;
  }

  logReveal(fieldName: string, userId: string, userRole: string, tableName: string, recordId: string): void {
    const entry = {
      fieldName,
      userId,
      userRole,
      timestamp: new Date(),
      tableName,
      recordId
    };
    this.revealLog.push(entry);
    
    // Send to audit service
    this.sendAuditLog(entry);
  }

  private async sendAuditLog(entry: any): Promise<void> {
    try {
      await fetch('/api/v1/audit/field-reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(entry)
      });
    } catch (err) {
      console.error('Failed to log field reveal:', err);
    }
  }
}

// MaskedField Component
export const MaskedField: React.FC<MaskedFieldProps> = ({
  value,
  config,
  userRole,
  userId,
  tableName,
  recordId
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const engine = useRef(new FieldMaskingEngine()).current;
  const canReveal = engine.canReveal(config, userRole);
  const maskedValue = engine.applyMask(value, config);

  const handleReveal = useCallback(() => {
    if (!canReveal) return;
    
    if (!isRevealed && config.auditReveal) {
      engine.logReveal(config.fieldName, userId, userRole, tableName, recordId);
    }
    setIsRevealed(true);
  }, [canReveal, isRevealed, config, engine, userId, userRole, tableName, recordId]);

  const handleHide = useCallback(() => {
    setIsRevealed(false);
    setIsHovered(false);
  }, []);

  // Auto-hide after 30 seconds for security
  useEffect(() => {
    if (!isRevealed) return;
    const timer = setTimeout(handleHide, 30000);
    return () => clearTimeout(timer);
  }, [isRevealed, handleHide]);

  const displayValue = isRevealed ? String(value) : maskedValue;

  return (
    <span 
      className={`masked-field ${config.phiClassification}`}
      onMouseEnter={() => config.revealOnHover && canReveal && setIsHovered(true)}
      onMouseLeave={() => !isRevealed && setIsHovered(false)}
    >
      <span className={`masked-field-value ${config.maskingType}`}>
        {displayValue}
      </span>
      
      {/* PHI Badge */}
      {config.phiClassification !== 'non-phi' && (
        <PHIBadge classification={config.phiClassification} />
      )}
      
      {/* Reveal/Hide Toggle */}
      {canReveal && config.phiClassification !== 'non-phi' && (
        <button
          className="mask-toggle-btn"
          onClick={isRevealed ? handleHide : handleReveal}
          title={isRevealed ? 'Click to hide' : 'Click to reveal'}
          aria-label={isRevealed ? 'Hide field value' : 'Reveal field value'}
        >
          {isRevealed ? '🙈' : '👁'}
        </button>
      )}
      
      {/* Hover Reveal Overlay */}
      {config.revealOnHover && canReveal && isHovered && !isRevealed && (
        <span 
          className="reveal-hover-hint"
          onClick={handleReveal}
        >
          Click to reveal
        </span>
      )}
    </span>
  );
};

// PHI Badge Component
export const PHIBadge: React.FC<{ classification: PHIClassification; showLabel?: boolean }> = ({
  classification,
  showLabel = true
}) => {
  const labels: Record<PHIClassification, string> = {
    direct: 'Direct PHI',
    quasi: 'Quasi-ID',
    sensitive: 'Sensitive',
    'non-phi': 'Non-PHI'
  };

  if (classification === 'non-phi' && !showLabel) return null;

  return (
    <span className={`phi-badge ${classification}`} title={labels[classification]}>
      {showLabel ? labels[classification] : 'PHI'}
    </span>
  );
};
```

### 5.2 Role-Based Visibility

```typescript
// RoleBasedVisibility.ts
interface RoleVisibilityPolicy {
  role: string;
  fieldPermissions: Map<string, FieldVisibilityPermission>;
  tablePermissions: Map<string, TableVisibilityPermission>;
  maxQueryRows: number;
  allowedExportFormats: string[];
  canBypassMasking: boolean;
  requiresJustification: boolean;
}

interface FieldVisibilityPermission {
  canView: boolean;
  canExport: boolean;
  maskingType: MaskingType;
  requiresDualControl: boolean;
  justificationRequired: boolean;
}

interface TableVisibilityPermission {
  canView: boolean;
  canQuery: boolean;
  canExport: boolean;
  rowLimit: number;
  allowedColumns: string[] | 'all';
  restrictedColumns: string[];
}

// Predefined roles for healthcare environments
const DEFAULT_ROLE_POLICIES: Record<string, RoleVisibilityPolicy> = {
  physician: {
    role: 'physician',
    fieldPermissions: new Map([
      ['ssn', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['mrn', { canView: true, canExport: true, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
      ['first_name', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['last_name', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['dob', { canView: true, canExport: false, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
      ['email', { canView: true, canExport: false, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
      ['phone', { canView: true, canExport: false, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
      ['diagnosis', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['medication', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
    ]),
    tablePermissions: new Map([
      ['patients', { canView: true, canQuery: true, canExport: false, rowLimit: 100, allowedColumns: 'all', restrictedColumns: [] }],
      ['encounters', { canView: true, canQuery: true, canExport: true, rowLimit: 500, allowedColumns: 'all', restrictedColumns: [] }],
      ['lab_results', { canView: true, canQuery: true, canExport: true, rowLimit: 1000, allowedColumns: 'all', restrictedColumns: [] }],
    ]),
    maxQueryRows: 1000,
    allowedExportFormats: ['csv', 'pdf'],
    canBypassMasking: false,
    requiresJustification: false
  },
  
  nurse: {
    role: 'nurse',
    fieldPermissions: new Map([
      ['ssn', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['mrn', { canView: true, canExport: false, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
      ['first_name', { canView: true, canExport: false, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['last_name', { canView: true, canExport: false, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['dob', { canView: true, canExport: false, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
      ['email', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['phone', { canView: true, canExport: false, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
    ]),
    tablePermissions: new Map([
      ['patients', { canView: true, canQuery: true, canExport: false, rowLimit: 50, allowedColumns: 'all', restrictedColumns: ['ssn', 'email'] }],
      ['vitals', { canView: true, canQuery: true, canExport: true, rowLimit: 500, allowedColumns: 'all', restrictedColumns: [] }],
      ['medications', { canView: true, canQuery: true, canExport: false, rowLimit: 200, allowedColumns: 'all', restrictedColumns: [] }],
    ]),
    maxQueryRows: 500,
    allowedExportFormats: ['csv'],
    canBypassMasking: false,
    requiresJustification: false
  },
  
  researcher: {
    role: 'researcher',
    fieldPermissions: new Map([
      ['ssn', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['mrn', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['first_name', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['last_name', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['dob', { canView: true, canExport: false, maskingType: 'partial', requiresDualControl: false, justificationRequired: false }],
      ['email', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['phone', { canView: false, canExport: false, maskingType: 'full', requiresDualControl: true, justificationRequired: true }],
      ['diagnosis', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
    ]),
    tablePermissions: new Map([
      ['patients', { canView: true, canQuery: true, canExport: false, rowLimit: 10000, allowedColumns: ['dob', 'gender', 'zip_code', 'diagnosis'], restrictedColumns: ['ssn', 'mrn', 'first_name', 'last_name', 'email', 'phone'] }],
      ['encounters', { canView: true, canQuery: true, canExport: true, rowLimit: 50000, allowedColumns: 'all', restrictedColumns: ['provider_notes'] }],
    ]),
    maxQueryRows: 50000,
    allowedExportFormats: ['csv', 'xlsx'],
    canBypassMasking: false,
    requiresJustification: true
  },
  
  compliance_officer: {
    role: 'compliance_officer',
    fieldPermissions: new Map([
      ['ssn', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: true }],
      ['mrn', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['first_name', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['last_name', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['dob', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['email', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
      ['phone', { canView: true, canExport: true, maskingType: 'none', requiresDualControl: false, justificationRequired: false }],
    ]),
    tablePermissions: new Map([
      ['*', { canView: true, canQuery: true, canExport: true, rowLimit: Number.MAX_SAFE_INTEGER, allowedColumns: 'all', restrictedColumns: [] }],
    ]),
    maxQueryRows: Number.MAX_SAFE_INTEGER,
    allowedExportFormats: ['csv', 'xlsx', 'pdf', 'json'],
    canBypassMasking: true,
    requiresJustification: true
  },
  
  admin: {
    role: 'admin',
    fieldPermissions: new Map(),
    tablePermissions: new Map([
      ['*', { canView: true, canQuery: true, canExport: true, rowLimit: Number.MAX_SAFE_INTEGER, allowedColumns: 'all', restrictedColumns: [] }],
    ]),
    maxQueryRows: Number.MAX_SAFE_INTEGER,
    allowedExportFormats: ['csv', 'xlsx', 'pdf', 'json', 'sql'],
    canBypassMasking: true,
    requiresJustification: false
  }
};
```

### 5.3 Hover-to-Reveal for Authorized Roles

```typescript
// HoverReveal.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface HoverRevealProps {
  maskedValue: string;
  actualValue: string;
  canReveal: boolean;
  revealDelay?: number;      // ms before reveal
  autoHideDelay?: number;    // ms before auto-hide
  onReveal?: () => void;     // Audit callback
  onHide?: () => void;
}

const HoverReveal: React.FC<HoverRevealProps> = ({
  maskedValue,
  actualValue,
  canReveal,
  revealDelay = 500,
  autoHideDelay = 5000,
  onReveal,
  onHide
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasRevealedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!canReveal) return;
    setIsHovering(true);
    
    clearTimers();
    
    revealTimerRef.current = setTimeout(() => {
      setIsRevealed(true);
      if (!hasRevealedRef.current) {
        hasRevealedRef.current = true;
        onReveal?.();
      }
      
      // Auto-hide after delay
      hideTimerRef.current = setTimeout(() => {
        setIsRevealed(false);
        onHide?.();
      }, autoHideDelay);
    }, revealDelay);
  }, [canReveal, revealDelay, autoHideDelay, onReveal, onHide, clearTimers]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    clearTimers();
    setIsRevealed(false);
  }, [clearTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  if (!canReveal) {
    return <span className="masked-field-value">{maskedValue}</span>;
  }

  return (
    <span 
      className="hover-reveal-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        // Toggle on click as well
        if (isRevealed) {
          setIsRevealed(false);
          onHide?.();
        } else {
          setIsRevealed(true);
          if (!hasRevealedRef.current) {
            hasRevealedRef.current = true;
            onReveal?.();
          }
        }
      }}
    >
      <span className={`hover-reveal-value ${isRevealed ? 'revealed' : 'masked'}`}>
        {isRevealed ? actualValue : maskedValue}
      </span>
      
      {isHovering && !isRevealed && (
        <span className="hover-reveal-tooltip">
          Hover to reveal... 🔓
        </span>
      )}
      
      {isRevealed && (
        <span className="hover-reveal-indicator">
          👁
        </span>
      )}
    </span>
  );
};
```

```css
/* Hover Reveal */
.hover-reveal-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  padding: 0.125rem 0.25rem;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.hover-reveal-container:hover {
  background-color: #f1f5f9;
}

.hover-reveal-value {
  transition: all 0.2s ease;
}

.hover-reveal-value.masked {
  font-family: 'Fira Code', monospace;
  color: #94a3b8;
  letter-spacing: 0.12em;
}

.hover-reveal-value.revealed {
  color: #1e293b;
  font-weight: 500;
  background: #fef3c7;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.hover-reveal-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: #ffffff;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.6875rem;
  white-space: nowrap;
  z-index: 100;
  animation: tooltipFadeIn 0.15s ease;
}

.hover-reveal-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: #1e293b;
}

.hover-reveal-indicator {
  font-size: 0.75rem;
  animation: fadeIn 0.2s ease;
}

@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### 5.4 Export Masking vs Display Masking

```typescript
// ExportMasking.ts
interface ExportConfig {
  format: 'csv' | 'xlsx' | 'pdf' | 'json' | 'sql';
  includeHeaders: boolean;
  maskingPolicy: 'display' | 'stricter' | 'full';
  dateRange?: { start: Date; end: Date };
  selectedFields: string[];
  rowFilter?: string;
  includeAuditLog: boolean;
  watermarkText: string;
}

class DataExporter {
  async exportData(
    tableName: string,
    config: ExportConfig,
    userRole: string
  ): Promise<Blob> {
    // Validate export permissions
    const policy = DEFAULT_ROLE_POLICIES[userRole];
    if (!policy || !policy.allowedExportFormats.includes(config.format)) {
      throw new Error(`Role ${userRole} cannot export to ${config.format} format`);
    }

    // Fetch data with appropriate masking
    const response = await fetch('/api/v1/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
        'X-Audit-Context': JSON.stringify({
          ...getAuditContext(),
          action: 'EXPORT_DATA',
          tableName,
          format: config.format,
          fields: config.selectedFields
        })
      },
      body: JSON.stringify({
        tableName,
        config,
        userRole
      })
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    return response.blob();
  }

  // Client-side CSV generation with masking
  generateCSV(
    data: any[],
    columns: string[],
    maskingConfig: Record<string, FieldMaskingConfig>,
    userRole: string
  ): string {
    const lines: string[] = [];
    
    // Header row
    lines.push(columns.join(','));
    
    // Data rows
    for (const row of data) {
      const values = columns.map(col => {
        const config = maskingConfig[col];
        let value = row[col];
        
        if (config) {
          // Apply stricter export masking
          const engine = new FieldMaskingEngine();
          value = engine.applyMask(value, {
            ...config,
            maskingType: this.getExportMaskingType(config, userRole)
          });
        }
        
        // CSV escape
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      
      lines.push(values.join(','));
    }
    
    return lines.join('\n');
  }

  private getExportMaskingType(config: FieldMaskingConfig, userRole: string): MaskingType {
    // Always apply stricter masking for exports
    const hierarchy: MaskingType[] = ['none', 'partial', 'hash', 'full', 'nullify'];
    const currentIdx = hierarchy.indexOf(config.maskingType);
    
    switch (userRole) {
      case 'physician':
        return hierarchy[Math.min(currentIdx + 1, hierarchy.length - 1)];
      case 'nurse':
        return 'full';
      case 'researcher':
        return 'hash';
      case 'compliance_officer':
        return config.maskingType;
      case 'admin':
        return 'none';
      default:
        return 'full';
    }
  }

  // Add watermark to PDF exports
  async addWatermark(pdfBlob: Blob, text: string): Promise<Blob> {
    // Implementation using PDF-lib or similar library
    // This is a placeholder for the actual implementation
    return pdfBlob;
  }
}
```

### 5.5 PHI Classification Tags

```typescript
// PHIClassification.ts
export const PHI_CATEGORIES: Record<string, { 
  fields: string[]; 
  classification: PHIClassification;
  description: string;
  hipaaIdentifier: boolean;
  gdprCategory?: string;
}> = {
  name: {
    fields: ['first_name', 'last_name', 'middle_name', 'full_name', 'patient_name', 'name'],
    classification: 'direct',
    description: 'Patient name - direct identifier',
    hipaaIdentifier: true,
    gdprCategory: 'personal_data'
  },
  
  ssn: {
    fields: ['ssn', 'social_security_number', 'social_security', 'national_id'],
    classification: 'direct',
    description: 'Social Security Number - direct identifier',
    hipaaIdentifier: true,
    gdprCategory: 'sensitive_personal_data'
  },
  
  mrn: {
    fields: ['mrn', 'medical_record_number', 'patient_id', 'record_number'],
    classification: 'direct',
    description: 'Medical Record Number - direct identifier',
    hipaaIdentifier: true,
    gdprCategory: 'sensitive_personal_data'
  },
  
  dob: {
    fields: ['dob', 'date_of_birth', 'birth_date', 'birthdate'],
    classification: 'quasi',
    description: 'Date of Birth - quasi-identifier',
    hipaaIdentifier: true,
    gdprCategory: 'sensitive_personal_data'
  },
  
  contact: {
    fields: ['email', 'phone', 'phone_number', 'mobile', 'address', 'street', 'city', 'zip', 'zip_code'],
    classification: 'direct',
    description: 'Contact information - direct identifier',
    hipaaIdentifier: true,
    gdprCategory: 'personal_data'
  },
  
  biometric: {
    fields: ['fingerprint', 'retina_scan', 'iris', 'voice_print', 'face_id'],
    classification: 'sensitive',
    description: 'Biometric identifiers',
    hipaaIdentifier: true,
    gdprCategory: 'biometric_data'
  },
  
  insurance: {
    fields: ['insurance_number', 'policy_number', 'group_number', 'insurance_id', 'health_plan_id'],
    classification: 'direct',
    description: 'Health plan beneficiary number',
    hipaaIdentifier: true,
    gdprCategory: 'sensitive_personal_data'
  },
  
  account: {
    fields: ['account_number', 'bank_account', 'credit_card', 'debit_card'],
    classification: 'direct',
    description: 'Account numbers',
    hipaaIdentifier: true,
    gdprCategory: 'financial_data'
  },
  
  certificate: {
    fields: ['certificate_number', 'license_number', 'device_serial'],
    classification: 'direct',
    description: 'Certificate/license numbers',
    hipaaIdentifier: true,
    gdprCategory: 'sensitive_personal_data'
  },
  
  vehicle: {
    fields: ['vehicle_id', 'vin', 'license_plate'],
    classification: 'direct',
    description: 'Vehicle identifiers',
    hipaaIdentifier: true
  },
  
  url: {
    fields: ['ip_address', 'mac_address', 'url', 'device_id'],
    classification: 'quasi',
    description: 'IP addresses and web identifiers',
    hipaaIdentifier: true,
    gdprCategory: 'online_identifier'
  },
  
  photo: {
    fields: ['photo', 'photograph', 'image', 'avatar', 'profile_image'],
    classification: 'direct',
    description: 'Full face photographs',
    hipaaIdentifier: true
  },
  
  diagnosis: {
    fields: ['diagnosis', 'diagnosis_code', 'icd_code', 'icd10', 'condition'],
    classification: 'sensitive',
    description: 'Diagnosis and condition information',
    hipaaIdentifier: false,
    gdprCategory: 'health_data'
  },
  
  medication: {
    fields: ['medication', 'drug', 'prescription', 'medication_name', 'drug_code'],
    classification: 'sensitive',
    description: 'Medication information',
    hipaaIdentifier: false,
    gdprCategory: 'health_data'
  },
  
  lab: {
    fields: ['lab_result', 'test_result', 'result_value', 'lab_value', 'test_code'],
    classification: 'sensitive',
    description: 'Laboratory results',
    hipaaIdentifier: false,
    gdprCategory: 'health_data'
  },
  
  vital: {
    fields: ['blood_pressure', 'heart_rate', 'temperature', 'weight', 'height', 'bmi', 'oxygen_saturation'],
    classification: 'sensitive',
    description: 'Vital signs and measurements',
    hipaaIdentifier: false,
    gdprCategory: 'health_data'
  }
};

// Auto-classify a field name
export function classifyField(fieldName: string): PHIClassification {
  for (const category of Object.values(PHI_CATEGORIES)) {
    if (category.fields.some(f => 
      fieldName.toLowerCase() === f || 
      fieldName.toLowerCase().includes(f)
    )) {
      return category.classification;
    }
  }
  return 'non-phi';
}

// Get all HIPAA identifiers present in a table
export function getHIPAAIdentifiers(columns: string[]): string[] {
  return columns.filter(col => {
    for (const category of Object.values(PHI_CATEGORIES)) {
      if (category.hipaaIdentifier && category.fields.some(f => 
        col.toLowerCase().includes(f)
      )) {
        return true;
      }
    }
    return false;
  });
}
```

---

## 6. Data Completeness

### 6.1 Completeness Score Per Table

The completeness score provides a high-level view of data quality at the table level, helping data stewards identify tables that need attention.

#### Wireframe Description

```
+-------------------------------------------------------------+
|  Data Quality Dashboard                           [Refresh]  |
+-------------------------------------------------------------+
|                                                             |
|  Overall Completeness: ████████████████████░░░  94.2%      |
|                                                             |
|  Sort by: [Score ▼]  Filter: [All Tables] [HIPAA Only]     |
|                                                             |
|  ┌──────────────────────────────────────────────────────┐   |
|  │ Table                │ Score │ Empty │ Total  │ Trend │   |
|  ├──────────────────────────────────────────────────────┤   |
|  │ patients             │ 98.1% │  247  │ 12,847 │  ↗️   │   |
|  │ encounters           │ 96.3% │  892  │ 24,156 │  →    │   |
|  │ vitals               │ 99.7% │   45  │ 15,234 │  ↗️   │   |
|  │ lab_results          │ 87.4% │ 5,643 │ 44,721 │  ↘️   │   |
|  │ ⚠️ medications       │ 72.1% │ 2,890 │ 10,341 │  ↘️   │   |
|  │ diagnoses            │ 94.2% │  421  │  7,284 │  →    │   |
|  │ appointments         │ 91.5% │  892  │ 10,492 │  ↘️   │   |
|  │ providers            │ 99.1% │    5  │    542 │  ↗️   │   |
|  │ insurance_claims     │ 85.3% │ 1,234 │  8,391 │  ↘️   │   |
|  └──────────────────────────────────────────────────────┘   |
|                                                             |
|  Legend: ↗️ Improving  → Stable  ↘️ Declining               |
|                                                             |
|  Color: ████ ≥95% Good  ████ 80-94% Warning  ████ <80% Alert│
+-------------------------------------------------------------+
```

#### JavaScript Implementation Pattern

```typescript
// DataCompleteness.ts
interface TableCompleteness {
  tableName: string;
  displayName: string;
  overallScore: number;
  totalRows: number;
  totalCells: number;
  emptyCells: number;
  emptyPercentage: number;
  columnScores: ColumnCompleteness[];
  trend: 'improving' | 'stable' | 'declining';
  trendDelta: number;  // percentage point change
  lastCalculated: Date;
  hipaaClassified: boolean;
}

interface ColumnCompleteness {
  columnName: string;
  dataType: string;
  totalRows: number;
  nullCount: number;
  emptyStringCount: number;
  zeroCount: number;
  filledCount: number;
  completenessScore: number;
  distinctValues: number;
  phiClassification: PHIClassification;
  isRequired: boolean;
}

class DataCompletenessAnalyzer {
  async calculateTableCompleteness(tableName: string): Promise<TableCompleteness> {
    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        (SELECT COUNT(*) FROM "${tableName}") as total_rows,
        (SELECT COUNT(*) FROM "${tableName}" WHERE "${'column_name'}" IS NULL) as null_count,
        (SELECT COUNT(*) FROM "${tableName}" WHERE "${'column_name'}"::text = '') as empty_count
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `;
    
    // Use a more efficient approach with a single pass
    const statsQuery = `
      SELECT 
        COUNT(*) as total_rows,
        ${await this.buildColumnStatsSubqueries(tableName)}
      FROM "${tableName}"
    `;
    
    const result = await db.query(statsQuery);
    const row = result.rows[0];
    const totalRows = parseInt(row.total_rows);
    
    // Get column metadata
    const columnsResult = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    
    const columnScores: ColumnCompleteness[] = columnsResult.rows.map(col => {
      const nullCount = parseInt(row[`${col.column_name}_null`] || 0);
      const emptyCount = parseInt(row[`${col.column_name}_empty`] || 0);
      const filledCount = totalRows - nullCount - emptyCount;
      
      return {
        columnName: col.column_name,
        dataType: col.data_type,
        totalRows,
        nullCount,
        emptyStringCount: emptyCount,
        zeroCount: 0, // Would need separate query for numeric columns
        filledCount,
        completenessScore: totalRows > 0 ? Math.round((filledCount / totalRows) * 1000) / 10 : 0,
        distinctValues: 0, // Would need separate query
        phiClassification: classifyField(col.column_name),
        isRequired: col.is_nullable === 'NO'
      };
    });
    
    const totalCells = totalRows * columnScores.length;
    const emptyCells = columnScores.reduce((sum, col) => sum + col.nullCount + col.emptyStringCount, 0);
    const overallScore = totalCells > 0 ? Math.round(((totalCells - emptyCells) / totalCells) * 1000) / 10 : 0;
    
    return {
      tableName,
      displayName: tableName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      overallScore,
      totalRows,
      totalCells,
      emptyCells,
      emptyPercentage: totalCells > 0 ? Math.round((emptyCells / totalCells) * 1000) / 10 : 0,
      columnScores,
      trend: 'stable',
      trendDelta: 0,
      lastCalculated: new Date(),
      hipaaClassified: await isHipaaClassified(tableName)
    };
  }

  private async buildColumnStatsSubqueries(tableName: string): Promise<string> {
    const columnsResult = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    
    return columnsResult.rows.map(col => `
      COUNT(CASE WHEN "${col.column_name}" IS NULL THEN 1 END) as "${col.column_name}_null",
      COUNT(CASE WHEN "${col.column_name}"::text = '' THEN 1 END) as "${col.column_name}_empty"
    `).join(',\n        ');
  }

  async getCompletenessTrend(tableName: string, days: number = 30): Promise<Array<{
    date: Date;
    score: number;
  }>> {
    const query = `
      SELECT 
        date_trunc('day', calculated_at) as date,
        AVG(overall_score) as score
      FROM completeness_history
      WHERE table_name = $1
      AND calculated_at > NOW() - INTERVAL '${days} days'
      GROUP BY date_trunc('day', calculated_at)
      ORDER BY date
    `;
    
    const result = await db.query(query, [tableName]);
    return result.rows.map(row => ({
      date: new Date(row.date),
      score: Math.round(parseFloat(row.score) * 10) / 10
    }));
  }
}

// Completeness Score Component
const CompletenessScore: React.FC<{ score: number; size?: 'sm' | 'md' | 'lg' }> = ({ 
  score, 
  size = 'md' 
}) => {
  const getColor = (s: number): string => {
    if (s >= 95) return '#22c55e';
    if (s >= 80) return '#f59e0b';
    return '#ef4444';
  };

  const getLabel = (s: number): string => {
    if (s >= 95) return 'Excellent';
    if (s >= 80) return 'Good';
    if (s >= 60) return 'Fair';
    return 'Poor';
  };

  const sizes = {
    sm: { width: 80, height: 80, fontSize: 20, stroke: 6 },
    md: { width: 120, height: 120, fontSize: 28, stroke: 8 },
    lg: { width: 160, height: 160, fontSize: 36, stroke: 10 }
  };

  const s = sizes[size];
  const radius = (s.width - s.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getColor(score);

  return (
    <div className="completeness-score-container" style={{ width: s.width, height: s.height }}>
      <svg width={s.width} height={s.height} className="completeness-score-svg">
        <circle
          cx={s.width / 2}
          cy={s.height / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={s.stroke}
        />
        <circle
          cx={s.width / 2}
          cy={s.height / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={s.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          transform={`rotate(-90 ${s.width / 2} ${s.height / 2})`}
        />
        <text
          x={s.width / 2}
          y={s.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={s.fontSize}
          fontWeight="600"
          fill="#1e293b"
        >
          {score}%
        </text>
      </svg>
      <span className="completeness-score-label" style={{ color }}>
        {getLabel(score)}
      </span>
    </div>
  );
};

// Completeness Table Component
const CompletenessTable: React.FC<{
  tables: TableCompleteness[];
}> = ({ tables }) => {
  const [sortField, setSortField] = useState<keyof TableCompleteness>('overallScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterHIPAA, setFilterHIPAA] = useState(false);

  const filtered = filterHIPAA ? tables.filter(t => t.hipaaClassified) : tables;
  
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDirection === 'asc' 
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const handleSort = (field: keyof TableCompleteness) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const overallAverage = tables.length > 0 
    ? Math.round(tables.reduce((sum, t) => sum + t.overallScore, 0) / tables.length * 10) / 10
    : 0;

  return (
    <div className="completeness-dashboard">
      <div className="completeness-summary">
        <CompletenessScore score={overallAverage} size="lg" />
        <div className="completeness-summary-details">
          <h2>Overall Data Completeness</h2>
          <p>Across {tables.length} tables • {tables.reduce((sum, t) => sum + t.totalRows, 0).toLocaleString()} total records</p>
          <label className="filter-checkbox">
            <input 
              type="checkbox" 
              checked={filterHIPAA} 
              onChange={e => setFilterHIPAA(e.target.checked)} 
            />
            Show HIPAA-classified tables only
          </label>
        </div>
      </div>

      <table className="completeness-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('displayName')}>Table {sortField === 'displayName' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
            <th onClick={() => handleSort('overallScore')}>Score {sortField === 'overallScore' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
            <th>Bar</th>
            <th onClick={() => handleSort('emptyCells')}>Empty Cells {sortField === 'emptyCells' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
            <th onClick={() => handleSort('totalRows')}>Total Rows {sortField === 'totalRows' && (sortDirection === 'asc' ? '▲' : '▼')}</th>
            <th>Trend</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(table => (
            <tr key={table.tableName} className={table.overallScore < 80 ? 'alert-row' : ''}>
              <td>
                <div className="table-name-cell">
                  {table.hipaaClassified && <span title="HIPAA">🔒</span>}
                  {table.overallScore < 80 && <span title="Low completeness">⚠️</span>}
                  {table.displayName}
                </div>
              </td>
              <td>
                <span className={`score-badge ${table.overallScore >= 95 ? 'good' : table.overallScore >= 80 ? 'warning' : 'alert'}`}>
                  {table.overallScore}%
                </span>
              </td>
              <td>
                <div className="score-bar">
                  <div 
                    className={`score-bar-fill ${table.overallScore >= 95 ? 'good' : table.overallScore >= 80 ? 'warning' : 'alert'}`}
                    style={{ width: `${table.overallScore}%` }}
                  />
                </div>
              </td>
              <td>{table.emptyCells.toLocaleString()}</td>
              <td>{table.totalRows.toLocaleString()}</td>
              <td>
                <TrendIndicator trend={table.trend} delta={table.trendDelta} />
              </td>
              <td>
                <button className="btn btn-sm btn-secondary">Details</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TrendIndicator: React.FC<{ trend: string; delta: number }> = ({ trend, delta }) => {
  const icons: Record<string, string> = {
    improving: '↗️',
    stable: '→',
    declining: '↘️'
  };
  
  const colors: Record<string, string> = {
    improving: '#22c55e',
    stable: '#94a3b8',
    declining: '#ef4444'
  };

  return (
    <span className="trend-indicator" style={{ color: colors[trend] }}>
      {icons[trend]} {delta !== 0 && `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
    </span>
  );
};
```

```css
/* Data Completeness */
.completeness-dashboard {
  padding: 1.5rem;
}

.completeness-summary {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  background: #f8fafc;
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.completeness-summary-details h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.completeness-summary-details p {
  margin: 0;
  color: #64748b;
  font-size: 0.875rem;
}

.completeness-score-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.completeness-score-svg {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.06));
}

.completeness-score-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  color: #475569;
  cursor: pointer;
}

.completeness-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.completeness-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  border-bottom: 2px solid #e2e8f0;
  font-weight: 600;
  color: #475569;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.completeness-table th:hover {
  background-color: #f8fafc;
}

.completeness-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.completeness-table tr:hover td {
  background-color: #f8fafc;
}

.completeness-table tr.alert-row {
  background-color: #fef2f2;
}

.completeness-table tr.alert-row:hover td {
  background-color: #fee2e2;
}

.table-name-cell {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 500;
  color: #1e293b;
}

.score-badge {
  display: inline-flex;
  padding: 0.25rem 0.625rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8125rem;
}

.score-badge.good { background: #dcfce7; color: #166534; }
.score-badge.warning { background: #fef3c7; color: #92400e; }
.score-badge.alert { background: #fee2e2; color: #dc2626; }

.score-bar {
  width: 120px;
  height: 8px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.score-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.5s ease;
}

.score-bar-fill.good { background: #22c55e; }
.score-bar-fill.warning { background: #f59e0b; }
.score-bar-fill.alert { background: #ef4444; }

.trend-indicator {
  font-size: 0.875rem;
  font-weight: 500;
}
```

### 6.2 Missing Field Tracking

```typescript
// MissingFieldTracker.ts
interface MissingFieldReport {
  tableName: string;
  columnName: string;
  phiClassification: PHIClassification;
  isRequired: boolean;
  nullCount: number;
  emptyCount: number;
  zeroCount: number;
  totalRows: number;
  missingPercentage: number;
  affectedRecords: string[];  // Sample of record IDs
  lastFilledDate: Date | null;
  impact: 'critical' | 'high' | 'medium' | 'low';
}

class MissingFieldTracker {
  async generateMissingFieldReport(
    tableName: string, 
    options: { 
      threshold?: number; 
      sampleSize?: number;
      includeNonRequired?: boolean;
    } = {}
  ): Promise<MissingFieldReport[]> {
    const { threshold = 5, sampleSize = 10, includeNonRequired = false } = options;
    
    const columns = await this.getColumns(tableName, includeNonRequired);
    const reports: MissingFieldReport[] = [];
    
    for (const col of columns) {
      const stats = await this.getColumnStats(tableName, col.columnName, sampleSize);
      const missingPercentage = ((stats.nullCount + stats.emptyCount) / stats.totalRows) * 100;
      
      if (missingPercentage >= threshold) {
        reports.push({
          tableName,
          columnName: col.columnName,
          phiClassification: classifyField(col.columnName),
          isRequired: col.isNullable === 'NO',
          nullCount: stats.nullCount,
          emptyCount: stats.emptyCount,
          zeroCount: stats.zeroCount,
          totalRows: stats.totalRows,
          missingPercentage: Math.round(missingPercentage * 10) / 10,
          affectedRecords: stats.sampleIds,
          lastFilledDate: stats.lastFilled,
          impact: this.calculateImpact(missingPercentage, col.isNullable === 'NO', classifyField(col.columnName))
        });
      }
    }
    
    return reports.sort((a, b) => b.missingPercentage - a.missingPercentage);
  }

  private calculateImpact(
    missingPercentage: number, 
    isRequired: boolean, 
    phiClass: PHIClassification
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (isRequired && missingPercentage > 50) return 'critical';
    if (isRequired && missingPercentage > 10) return 'high';
    if (phiClass === 'direct' && missingPercentage > 30) return 'high';
    if (missingPercentage > 50) return 'high';
    if (missingPercentage > 20) return 'medium';
    return 'low';
  }

  private async getColumnStats(tableName: string, columnName: string, sampleSize: number) {
    const query = `
      SELECT 
        COUNT(*) as total_rows,
        COUNT(CASE WHEN "${columnName}" IS NULL THEN 1 END) as null_count,
        COUNT(CASE WHEN "${columnName}"::text = '' THEN 1 END) as empty_count,
        COUNT(CASE WHEN "${columnName}"::text = '0' OR "${columnName}" = 0 THEN 1 END) as zero_count,
        MAX("${columnName}"::text) as last_value,
        (SELECT array_agg(id) FROM (
          SELECT id FROM "${tableName}" 
          WHERE "${columnName}" IS NULL OR "${columnName}"::text = ''
          LIMIT $1
        ) sub) as sample_ids
      FROM "${tableName}"
    `;
    
    const result = await db.query(query, [sampleSize]);
    const row = result.rows[0];
    
    return {
      totalRows: parseInt(row.total_rows),
      nullCount: parseInt(row.null_count),
      emptyCount: parseInt(row.empty_count),
      zeroCount: parseInt(row.zero_count),
      lastFilled: row.last_value ? new Date() : null,
      sampleIds: row.sample_ids || []
    };
  }

  private async getColumns(tableName: string, includeNonRequired: boolean) {
    const query = `
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = $1
      ${!includeNonRequired ? "AND is_nullable = 'NO'" : ''}
      ORDER BY ordinal_position
    `;
    
    const result = await db.query(query, [tableName]);
    return result.rows;
  }
}
```

### 6.3 Field-Level Statistics

```typescript
// FieldStatistics.ts
interface FieldStatistics {
  columnName: string;
  dataType: string;
  totalRows: number;
  nullCount: number;
  nullPercentage: number;
  distinctCount: number;
  distinctPercentage: number;
  minValue: any;
  maxValue: any;
  avgValue: any;
  medianValue: any;
  modeValue: any;
  mostCommonValues: Array<{ value: any; count: number; percentage: number }>;
  cardinality: 'high' | 'medium' | 'low';
  distribution: Record<string, number>;
  dataQualityIssues: DataQualityIssue[];
}

interface DataQualityIssue {
  type: 'outlier' | 'inconsistent_format' | 'suspicious_value' | 'duplicate';
  description: string;
  severity: 'critical' | 'warning' | 'info';
  affectedCount: number;
  sampleValues: any[];
}

class FieldStatisticsAnalyzer {
  async analyzeField(tableName: string, columnName: string): Promise<FieldStatistics> {
    const query = `
      SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT "${columnName}") as distinct_count,
        COUNT(CASE WHEN "${columnName}" IS NULL THEN 1 END) as null_count,
        MIN("${columnName}") as min_value,
        MAX("${columnName}") as max_value,
        AVG("${columnName}"::numeric) as avg_value,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "${columnName}") as median_value,
        MODE() WITHIN GROUP (ORDER BY "${columnName}") as mode_value
      FROM "${tableName}"
    `;
    
    const result = await db.query(query);
    const row = result.rows[0];
    
    const totalRows = parseInt(row.total_rows);
    const distinctCount = parseInt(row.distinct_count);
    const nullCount = parseInt(row.null_count);
    
    // Get most common values
    const mostCommonQuery = `
      SELECT "${columnName}" as value, COUNT(*) as count,
        ROUND(COUNT(*)::numeric / ${totalRows} * 100, 2) as percentage
      FROM "${tableName}"
      WHERE "${columnName}" IS NOT NULL
      GROUP BY "${columnName}"
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const commonResult = await db.query(mostCommonQuery);
    
    // Detect data quality issues
    const qualityIssues = await this.detectQualityIssues(tableName, columnName);
    
    return {
      columnName,
      dataType: await this.getColumnDataType(tableName, columnName),
      totalRows,
      nullCount,
      nullPercentage: totalRows > 0 ? Math.round((nullCount / totalRows) * 1000) / 10 : 0,
      distinctCount,
      distinctPercentage: totalRows > 0 ? Math.round((distinctCount / totalRows) * 1000) / 10 : 0,
      minValue: row.min_value,
      maxValue: row.max_value,
      avgValue: row.avg_value ? Math.round(parseFloat(row.avg_value) * 100) / 100 : null,
      medianValue: row.median_value,
      modeValue: row.mode_value,
      mostCommonValues: commonResult.rows.map(r => ({
        value: r.value,
        count: parseInt(r.count),
        percentage: parseFloat(r.percentage)
      })),
      cardinality: distinctCount / totalRows > 0.9 ? 'high' : distinctCount / totalRows > 0.3 ? 'medium' : 'low',
      distribution: {}, // Would need histogram query
      dataQualityIssues: qualityIssues
    };
  }

  private async detectQualityIssues(tableName: string, columnName: string): Promise<DataQualityIssue[]> {
    const issues: DataQualityIssue[] = [];
    
    // Check for outliers in numeric columns
    const isNumeric = await this.isNumericColumn(tableName, columnName);
    if (isNumeric) {
      const outlierQuery = `
        WITH stats AS (
          SELECT 
            AVG("${columnName}"::numeric) as mean,
            STDDEV("${columnName}"::numeric) as stddev
          FROM "${tableName}"
          WHERE "${columnName}" IS NOT NULL
        )
        SELECT COUNT(*) as outlier_count
        FROM "${tableName}" t, stats s
        WHERE "${columnName}" IS NOT NULL
        AND ABS("${columnName}"::numeric - s.mean) > 3 * s.stddev
      `;
      
      const result = await db.query(outlierQuery);
      const outlierCount = parseInt(result.rows[0]?.outlier_count || 0);
      
      if (outlierCount > 0) {
        issues.push({
          type: 'outlier',
          description: `${outlierCount} values are more than 3 standard deviations from the mean`,
          severity: outlierCount > 10 ? 'warning' : 'info',
          affectedCount: outlierCount,
          sampleValues: []
        });
      }
    }
    
    return issues;
  }

  private async getColumnDataType(tableName: string, columnName: string): Promise<string> {
    const query = `
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `;
    const result = await db.query(query, [tableName, columnName]);
    return result.rows[0]?.data_type || 'unknown';
  }

  private async isNumericColumn(tableName: string, columnName: string): Promise<boolean> {
    const numericTypes = ['integer', 'bigint', 'numeric', 'decimal', 'real', 'double precision'];
    const dataType = await this.getColumnDataType(tableName, columnName);
    return numericTypes.includes(dataType);
  }
}
```

### 6.4 Quality Indicators

```typescript
// QualityIndicators.tsx
interface QualityIndicator {
  name: string;
  score: number;  // 0-100
  weight: number;
  description: string;
}

interface TableQualityScore {
  tableName: string;
  overallScore: number;
  indicators: QualityIndicator[];
  issues: QualityIssue[];
  recommendations: string[];
}

interface QualityIssue {
  id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  affectedColumns: string[];
  affectedRows: number;
  suggestion: string;
}

const QualityIndicatorsPanel: React.FC<{ score: TableQualityScore }> = ({ score }) => {
  return (
    <div className="quality-panel">
      <div className="quality-score-header">
        <CompletenessScore score={score.overallScore} size="md" />
        <div className="quality-score-info">
          <h3>{score.tableName}</h3>
          <p>Quality Score: {score.overallScore}/100</p>
        </div>
      </div>
      
      <div className="quality-indicators-grid">
        {score.indicators.map(indicator => (
          <QualityIndicatorCard key={indicator.name} indicator={indicator} />
        ))}
      </div>
      
      {score.issues.length > 0 && (
        <div className="quality-issues">
          <h4>Issues ({score.issues.length})</h4>
          {score.issues.map(issue => (
            <QualityIssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
      
      {score.recommendations.length > 0 && (
        <div className="quality-recommendations">
          <h4>Recommendations</h4>
          <ul>
            {score.recommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const QualityIndicatorCard: React.FC<{ indicator: QualityIndicator }> = ({ indicator }) => {
  const getColor = (score: number) => {
    if (score >= 90) return '#22c55e';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="quality-indicator-card">
      <div className="quality-indicator-header">
        <span className="quality-indicator-name">{indicator.name}</span>
        <span className="quality-indicator-score" style={{ color: getColor(indicator.score) }}>
          {indicator.score}%
        </span>
      </div>
      <div className="quality-indicator-bar">
        <div 
          className="quality-indicator-bar-fill"
          style={{ width: `${indicator.score}%`, backgroundColor: getColor(indicator.score) }}
        />
      </div>
      <p className="quality-indicator-desc">{indicator.description}</p>
      <span className="quality-indicator-weight">Weight: {indicator.weight}%</span>
    </div>
  );
};

const QualityIssueCard: React.FC<{ issue: QualityIssue }> = ({ issue }) => {
  const severityColors: Record<string, { bg: string; text: string }> = {
    critical: { bg: '#fee2e2', text: '#dc2626' },
    high: { bg: '#fef3c7', text: '#92400e' },
    medium: { bg: '#fef9c3', text: '#854d0e' },
    low: { bg: '#dbeafe', text: '#1e40af' }
  };

  const colors = severityColors[issue.severity];

  return (
    <div className="quality-issue-card">
      <div className="quality-issue-header">
        <span 
          className="quality-issue-severity"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {issue.severity}
        </span>
        <span className="quality-issue-category">{issue.category}</span>
      </div>
      <p className="quality-issue-message">{issue.message}</p>
      <div className="quality-issue-meta">
        <span>Columns: {issue.affectedColumns.join(', ')}</span>
        <span>Rows: {issue.affectedRows.toLocaleString()}</span>
      </div>
      <p className="quality-issue-suggestion">💡 {issue.suggestion}</p>
    </div>
  );
};
```

```css
/* Quality Indicators */
.quality-panel {
  padding: 1.5rem;
}

.quality-score-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.quality-score-info h3 {
  margin: 0;
  font-size: 1.125rem;
  color: #1e293b;
}

.quality-score-info p {
  margin: 0.25rem 0 0 0;
  color: #64748b;
  font-size: 0.875rem;
}

.quality-indicators-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.quality-indicator-card {
  padding: 1rem;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.quality-indicator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.quality-indicator-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #475569;
}

.quality-indicator-score {
  font-size: 0.9375rem;
  font-weight: 700;
}

.quality-indicator-bar {
  width: 100%;
  height: 6px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.quality-indicator-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.5s ease;
}

.quality-indicator-desc {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0 0 0.25rem 0;
}

.quality-indicator-weight {
  font-size: 0.6875rem;
  color: #94a3b8;
}

.quality-issues {
  margin-bottom: 1.5rem;
}

.quality-issues h4 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 0.75rem;
}

.quality-issue-card {
  padding: 0.875rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.quality-issue-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.quality-issue-severity {
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
}

.quality-issue-category {
  font-size: 0.75rem;
  color: #94a3b8;
}

.quality-issue-message {
  font-size: 0.875rem;
  color: #1e293b;
  margin: 0 0 0.375rem 0;
}

.quality-issue-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #64748b;
  margin-bottom: 0.375rem;
}

.quality-issue-suggestion {
  font-size: 0.8125rem;
  color: #2563eb;
  margin: 0;
  padding: 0.375rem 0.5rem;
  background: #eff6ff;
  border-radius: 4px;
}

.quality-recommendations {
  padding: 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
}

.quality-recommendations h4 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #166534;
  margin: 0 0 0.5rem 0;
}

.quality-recommendations ul {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: #15803d;
}

.quality-recommendations li {
  margin-bottom: 0.25rem;
}
```



---

## 7. Navigation Patterns

### 7.1 Breadcrumb Trails

Breadcrumb navigation provides users with orientation within the data hierarchy and supports easy navigation back to parent views.

#### Wireframe Description

```
+-------------------------------------------------------------+
|  Clinic Data Explorer                              [?] [User] |
+-------------------------------------------------------------+
|  Home > Patients > John Doe (#MRN-4521) > Encounters > #2847 |
|         [table]  [row]        [related]     [row]            |
+-------------------------------------------------------------+
|  The breadcrumb shows the full navigation path with the     |
|  ability to click any segment to jump back. Each segment    |
|  shows its type icon: 📋 table, 📄 record, 🔗 relationship.  |
+-------------------------------------------------------------+
```

#### JavaScript Implementation Pattern

```typescript
// BreadcrumbNavigation.ts
interface BreadcrumbSegment {
  id: string;
  label: string;
  type: 'home' | 'table_browser' | 'table' | 'row' | 'related_table' | 'query' | 'schema' | 'report';
  tableName?: string;
  rowId?: string;
  query?: string;
  icon: string;
  href: string;
  timestamp: Date;
}

class BreadcrumbManager {
  private segments: BreadcrumbSegment[] = [];
  private maxDepth: number = 10;
  private listeners: Set<(segments: BreadcrumbSegment[]) => void> = new Set();

  push(segment: Omit<BreadcrumbSegment, 'timestamp'>): void {
    // Prevent duplicate consecutive entries
    const last = this.segments[this.segments.length - 1];
    if (last && last.id === segment.id) return;
    
    // Truncate if we've exceeded max depth
    if (this.segments.length >= this.maxDepth) {
      this.segments = this.segments.slice(-this.maxDepth + 1);
    }
    
    this.segments.push({ ...segment, timestamp: new Date() });
    this.notifyListeners();
  }

  navigateTo(index: number): BreadcrumbSegment[] {
    this.segments = this.segments.slice(0, index + 1);
    this.notifyListeners();
    return this.segments;
  }

  navigateToSegment(segmentId: string): BreadcrumbSegment[] {
    const index = this.segments.findIndex(s => s.id === segmentId);
    if (index >= 0) {
      return this.navigateTo(index);
    }
    return this.segments;
  }

  getCurrentPath(): BreadcrumbSegment[] {
    return [...this.segments];
  }

  getParentSegment(): BreadcrumbSegment | null {
    return this.segments.length > 1 
      ? this.segments[this.segments.length - 2] 
      : null;
  }

  subscribe(listener: (segments: BreadcrumbSegment[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const segments = this.getCurrentPath();
    this.listeners.forEach(l => l(segments));
  }

  // Auto-generate breadcrumbs from navigation events
  fromTableBrowser(tableName: string): BreadcrumbSegment[] {
    this.push({
      id: `table-browser`,
      label: 'Tables',
      type: 'table_browser',
      icon: '📋',
      href: '/tables'
    });
    return this.segments;
  }

  fromTableView(tableName: string, displayName: string): BreadcrumbSegment[] {
    this.push({
      id: `table-${tableName}`,
      label: displayName,
      type: 'table',
      tableName,
      icon: '📋',
      href: `/tables/${tableName}`
    });
    return this.segments;
  }

  fromRowView(tableName: string, rowId: string, label: string): BreadcrumbSegment[] {
    this.push({
      id: `row-${tableName}-${rowId}`,
      label: label.length > 30 ? label.slice(0, 30) + '...' : label,
      type: 'row',
      tableName,
      rowId,
      icon: '📄',
      href: `/tables/${tableName}/rows/${rowId}`
    });
    return this.segments;
  }

  fromRelatedTable(
    parentTable: string, 
    parentRowId: string, 
    relatedTable: string, 
    displayName: string
  ): BreadcrumbSegment[] {
    this.push({
      id: `related-${parentTable}-${parentRowId}-${relatedTable}`,
      label: displayName,
      type: 'related_table',
      tableName: relatedTable,
      icon: '🔗',
      href: `/tables/${parentTable}/rows/${parentRowId}/related/${relatedTable}`
    });
    return this.segments;
  }
}

// Breadcrumb Component
const BreadcrumbNav: React.FC<{
  segments: BreadcrumbSegment[];
  onNavigate: (index: number) => void;
}> = ({ segments, onNavigate }) => {
  if (segments.length === 0) return null;

  return (
    <nav className="breadcrumb-nav" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          
          return (
            <li key={segment.id} className={`breadcrumb-item ${isLast ? 'active' : ''}`}>
              {index > 0 && (
                <span className="breadcrumb-separator" aria-hidden="true">›</span>
              )}
              
              {isLast ? (
                <span className="breadcrumb-current">
                  <span className="breadcrumb-icon">{segment.icon}</span>
                  <span className="breadcrumb-label">{segment.label}</span>
                </span>
              ) : (
                <button 
                  className="breadcrumb-link"
                  onClick={() => onNavigate(index)}
                  title={`Back to ${segment.label}`}
                >
                  <span className="breadcrumb-icon">{segment.icon}</span>
                  <span className="breadcrumb-label">{segment.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
```

```css
/* Breadcrumb Navigation */
.breadcrumb-nav {
  padding: 0.625rem 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.breadcrumb-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
}

.breadcrumb-separator {
  color: #cbd5e1;
  margin: 0 0.5rem;
  font-size: 1rem;
  font-weight: 300;
}

.breadcrumb-link {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
}

.breadcrumb-link:hover {
  background: #eff6ff;
  color: #1e40af;
}

.breadcrumb-current {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1e293b;
}

.breadcrumb-icon {
  font-size: 0.875rem;
}

.breadcrumb-label {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 7.2 Patient-Centric Navigation

Patient-centric navigation organizes all views around the patient as the central entity, with all related data (encounters, labs, medications) branching from the patient record.

```typescript
// PatientNavigation.ts
interface PatientRecord {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: string;
  age: number;
  profilePhoto?: string;
  status: 'active' | 'inactive' | 'deceased';
  lastEncounterDate: Date | null;
  alerts: PatientAlert[];
}

interface PatientAlert {
  id: string;
  type: 'allergy' | 'medication' | 'diagnosis' | 'appointment' | 'lab';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  date: Date;
}

interface PatientNavigationSection {
  id: string;
  label: string;
  icon: string;
  tableName: string;
  count: number;
  badge?: string;
  badgeColor?: string;
  isVisible: boolean;
}

const PATIENT_NAVIGATION_SECTIONS: PatientNavigationSection[] = [
  { id: 'overview', label: 'Overview', icon: '📊', tableName: '', count: 0, isVisible: true },
  { id: 'demographics', label: 'Demographics', icon: '👤', tableName: 'patients', count: 0, isVisible: true },
  { id: 'encounters', label: 'Encounters', icon: '🏥', tableName: 'encounters', count: 0, isVisible: true },
  { id: 'vitals', label: 'Vitals', icon: '📈', tableName: 'vitals', count: 0, isVisible: true },
  { id: 'lab_results', label: 'Lab Results', icon: '🧪', tableName: 'lab_results', count: 0, isVisible: true },
  { id: 'medications', label: 'Medications', icon: '💊', tableName: 'medications', count: 0, isVisible: true },
  { id: 'diagnoses', label: 'Diagnoses', icon: '📋', tableName: 'diagnoses', count: 0, isVisible: true },
  { id: 'procedures', label: 'Procedures', icon: '🔬', tableName: 'procedures', count: 0, isVisible: true },
  { id: 'allergies', label: 'Allergies', icon: '⚠️', tableName: 'allergies', count: 0, badge: 'Critical', badgeColor: '#dc2626', isVisible: true },
  { id: 'immunizations', label: 'Immunizations', icon: '💉', tableName: 'immunizations', count: 0, isVisible: true },
  { id: 'appointments', label: 'Appointments', icon: '📅', tableName: 'appointments', count: 0, isVisible: true },
  { id: 'documents', label: 'Documents', icon: '📄', tableName: 'documents', count: 0, isVisible: true },
];

// Patient Navigation Panel
const PatientNavigationPanel: React.FC<{
  patient: PatientRecord;
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  sectionCounts: Record<string, number>;
}> = ({ patient, activeSection, onSectionChange, sectionCounts }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`patient-nav-panel ${collapsed ? 'collapsed' : ''}`}>
      <button 
        className="patient-nav-collapse-btn"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? '▶' : '◀'}
      </button>
      
      {!collapsed && (
        <>
          {/* Patient Header */}
          <div className="patient-nav-header">
            <div className="patient-nav-avatar">
              {patient.profilePhoto ? (
                <img src={patient.profilePhoto} alt={`${patient.firstName} ${patient.lastName}`} />
              ) : (
                <div className="patient-nav-avatar-placeholder">
                  {patient.firstName[0]}{patient.lastName[0]}
                </div>
              )}
              <span className={`patient-status-dot ${patient.status}`} />
            </div>
            <div className="patient-nav-info">
              <h3 className="patient-nav-name">
                {patient.lastName}, {patient.firstName}
              </h3>
              <p className="patient-nav-meta">
                MRN: {patient.mrn} • {patient.gender} • {patient.age}y
              </p>
              <p className="patient-nav-dob">
                DOB: {patient.dateOfBirth.toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Alerts */}
          {patient.alerts.length > 0 && (
            <div className="patient-nav-alerts">
              {patient.alerts.map(alert => (
                <div key={alert.id} className={`patient-alert patient-alert-${alert.severity}`}>
                  <span className="patient-alert-icon">
                    {alert.type === 'allergy' ? '⚠️' : 
                     alert.type === 'medication' ? '💊' : 
                     alert.type === 'diagnosis' ? '📋' : 
                     alert.type === 'appointment' ? '📅' : '🧪'}
                  </span>
                  <span className="patient-alert-message">{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Navigation Sections */}
          <nav className="patient-nav-sections">
            {PATIENT_NAVIGATION_SECTIONS.filter(s => s.isVisible).map(section => {
              const count = sectionCounts[section.id] || 0;
              const isActive = activeSection === section.id;
              
              return (
                <button
                  key={section.id}
                  className={`patient-nav-section ${isActive ? 'active' : ''}`}
                  onClick={() => onSectionChange(section.id)}
                >
                  <span className="patient-nav-section-icon">{section.icon}</span>
                  <span className="patient-nav-section-label">{section.label}</span>
                  {count > 0 && (
                    <span className="patient-nav-section-count">{count}</span>
                  )}
                  {section.badge && (
                    <span 
                      className="patient-nav-section-badge"
                      style={{ backgroundColor: section.badgeColor }}
                    >
                      {section.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </>
      )}
    </aside>
  );
};
```

```css
/* Patient Navigation Panel */
.patient-nav-panel {
  width: 280px;
  min-width: 280px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  height: 100%;
  overflow-y: auto;
  position: relative;
  transition: width 0.2s ease;
}

.patient-nav-panel.collapsed {
  width: 36px;
  min-width: 36px;
}

.patient-nav-collapse-btn {
  position: absolute;
  top: 0.5rem;
  right: -12px;
  width: 24px;
  height: 24px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.patient-nav-header {
  padding: 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  gap: 0.875rem;
  align-items: center;
}

.patient-nav-avatar {
  position: relative;
  flex-shrink: 0;
}

.patient-nav-avatar img,
.patient-nav-avatar-placeholder {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
}

.patient-nav-avatar-placeholder {
  background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1rem;
}

.patient-status-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #ffffff;
}

.patient-status-dot.active { background: #22c55e; }
.patient-status-dot.inactive { background: #f59e0b; }
.patient-status-dot.deceased { background: #94a3b8; }

.patient-nav-name {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
}

.patient-nav-meta,
.patient-nav-dob {
  margin: 0.125rem 0 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.patient-nav-alerts {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.patient-alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 6px;
  margin-bottom: 0.375rem;
  font-size: 0.75rem;
}

.patient-alert-critical {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.patient-alert-warning {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.patient-alert-info {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}

.patient-alert-icon {
  flex-shrink: 0;
}

.patient-alert-message {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patient-nav-sections {
  padding: 0.5rem;
}

.patient-nav-section {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border-radius: 8px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: #475569;
  transition: all 0.15s ease;
  text-align: left;
  position: relative;
}

.patient-nav-section:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.patient-nav-section.active {
  background: #eff6ff;
  color: #1e40af;
  font-weight: 500;
}

.patient-nav-section.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: #3b82f6;
  border-radius: 0 2px 2px 0;
}

.patient-nav-section-icon {
  font-size: 1rem;
  width: 24px;
  text-align: center;
}

.patient-nav-section-label {
  flex: 1;
}

.patient-nav-section-count {
  background: #e2e8f0;
  color: #475569;
  padding: 0.0625rem 0.375rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
}

.patient-nav-section-badge {
  padding: 0.0625rem 0.375rem;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 600;
  color: #ffffff;
}
```

### 7.3 Table-Centric Navigation

Table-centric navigation treats tables as first-class entities, providing quick access to all data through a table-oriented interface.

```typescript
// TableNavigation.ts
interface TableNavigationConfig {
  id: string;
  label: string;
  icon: string;
  category: string;
  tableName: string;
  rowCount: number;
  lastUpdated: Date;
  isFavorite: boolean;
  permissions: string[];
  quickFilters: QuickFilter[];
}

interface QuickFilter {
  id: string;
  label: string;
  filter: Record<string, any>;
  resultCount?: number;
}

const TABLE_CATEGORIES = [
  { id: 'patient_data', label: 'Patient Data', color: '#3b82f6' },
  { id: 'clinical', label: 'Clinical', color: '#22c55e' },
  { id: 'administrative', label: 'Administrative', color: '#f59e0b' },
  { id: 'billing', label: 'Billing', color: '#8b5cf6' },
  { id: 'reference', label: 'Reference', color: '#64748b' },
];

// Table Explorer Grid
const TableExplorer: React.FC = () => {
  const [tables, setTables] = useState<TableNavigationConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filtered = tables.filter(t => {
    const matchesSearch = !searchQuery || 
      t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tableName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
    const matchesFavorite = !favoritesOnly || t.isFavorite;
    return matchesSearch && matchesCategory && matchesFavorite;
  });

  const grouped = filtered.reduce((acc, t) => {
    acc[t.category] = acc[t.category] || [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, TableNavigationConfig[]>);

  return (
    <div className="table-explorer">
      {/* Toolbar */}
      <div className="table-explorer-toolbar">
        <input
          type="text"
          className="table-explorer-search"
          placeholder="Search tables..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        
        <div className="table-explorer-filters">
          <select 
            value={activeCategory} 
            onChange={e => setActiveCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {TABLE_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          
          <label className="toggle-favorite">
            <input 
              type="checkbox" 
              checked={favoritesOnly} 
              onChange={e => setFavoritesOnly(e.target.checked)} 
            />
            ⭐ Favorites Only
          </label>
          
          <div className="view-toggle">
            <button 
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
            >
              ⊞
            </button>
            <button 
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <div className="table-explorer-grid">
          {Object.entries(grouped).map(([category, categoryTables]) => {
            const catConfig = TABLE_CATEGORIES.find(c => c.id === category);
            return (
              <div key={category} className="table-category-group">
                <h3 className="table-category-title" style={{ color: catConfig?.color }}>
                  <span 
                    className="table-category-dot" 
                    style={{ backgroundColor: catConfig?.color }}
                  />
                  {catConfig?.label || category}
                  <span className="table-category-count">{categoryTables.length}</span>
                </h3>
                <div className="table-cards-grid">
                  {categoryTables.map(table => (
                    <TableCard key={table.id} table={table} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <TableListView tables={filtered} />
      )}
    </div>
  );
};
```

```css
/* Table Explorer */
.table-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.table-explorer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  gap: 1rem;
  flex-wrap: wrap;
}

.table-explorer-search {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  padding: 0.5rem 0.875rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.875rem;
}

.table-explorer-search:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.table-explorer-filters {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.table-explorer-filters select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.875rem;
  background: #ffffff;
}

.toggle-favorite {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: #475569;
  cursor: pointer;
}

.view-toggle {
  display: flex;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
}

.view-toggle button {
  padding: 0.5rem 0.75rem;
  border: none;
  background: #ffffff;
  cursor: pointer;
  font-size: 0.875rem;
  color: #64748b;
  transition: all 0.15s ease;
}

.view-toggle button.active {
  background: #eff6ff;
  color: #1e40af;
}

.table-explorer-grid {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.table-category-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.table-category-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
}

.table-category-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.table-category-count {
  margin-left: 0.5rem;
  background: #e2e8f0;
  color: #475569;
  padding: 0.0625rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
}

.table-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.875rem;
}
```

### 7.4 Search-First Navigation

Search-first navigation prioritizes a global search bar as the primary entry point, allowing users to find any record, table, or field by typing.

```typescript
// GlobalSearch.ts
interface GlobalSearchResult {
  id: string;
  type: 'table' | 'row' | 'column' | 'query' | 'patient';
  title: string;
  subtitle: string;
  tableName?: string;
  recordId?: string;
  highlights: string[];
  icon: string;
  relevance: number;
  action: 'navigate' | 'view' | 'edit';
  url: string;
}

interface SearchSuggestion {
  id: string;
  type: 'recent' | 'table' | 'patient' | 'saved_query';
  label: string;
  icon: string;
}

const GlobalSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (query.length < 2) {
      setResults([]);
      loadSuggestions();
      return;
    }
    
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 200);
  }, [query]);

  const loadSuggestions = async () => {
    // Load recent searches, popular tables, etc.
    const recent: SearchSuggestion[] = [
      { id: 'recent-1', type: 'recent', label: 'patients WHERE created_at > 2024-01-01', icon: '🕐' },
      { id: 'recent-2', type: 'recent', label: 'lab_results for patient #4521', icon: '🕐' },
    ];
    setSuggestions(recent);
  };

  const performSearch = async (searchQuery: string) => {
    try {
      const response = await fetch('/api/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ query: searchQuery, limit: 20 })
      });
      
      const data = await response.json();
      setResults(data.results);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected) {
        navigateTo(selected.url);
        setIsOpen(false);
      }
    }
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button 
        className="global-search-trigger"
        onClick={() => { setIsOpen(true); inputRef.current?.focus(); }}
      >
        <span>🔍</span>
        <span className="search-trigger-text">Search...</span>
        <kbd className="search-shortcut">⌘K</kbd>
      </button>

      {/* Search Modal */}
      {isOpen && (
        <div className="global-search-overlay" onClick={() => setIsOpen(false)}>
          <div className="global-search-modal" onClick={e => e.stopPropagation()}>
            {/* Search Input */}
            <div className="global-search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                ref={inputRef}
                type="text"
                className="global-search-input"
                placeholder="Search tables, records, patients..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              {loading && <span className="search-spinner">⟳</span>}
              <kbd className="search-esc">ESC</kbd>
            </div>

            {/* Results */}
            <div className="global-search-results">
              {query.length < 2 ? (
                /* Suggestions */
                <div className="search-suggestions">
                  <div className="search-section-title">Recent</div>
                  {suggestions.map(s => (
                    <div key={s.id} className="search-suggestion-item">
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                    </div>
                  ))}
                </div>
              ) : results.length > 0 ? (
                /* Search Results */
                results.map((result, idx) => (
                  <div
                    key={result.id}
                    className={`search-result-item ${idx === selectedIndex ? 'selected' : ''}`}
                    onClick={() => { navigateTo(result.url); setIsOpen(false); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="result-icon">{result.icon}</span>
                    <div className="result-content">
                      <div className="result-title">{result.title}</div>
                      <div className="result-subtitle">{result.subtitle}</div>
                      {result.highlights.length > 0 && (
                        <div className="result-highlights">
                          {result.highlights.map((h, hidx) => (
                            <span key={hidx} dangerouslySetInnerHTML={{ __html: h }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="result-type">{result.type}</span>
                  </div>
                ))
              ) : (
                /* Empty State */
                <div className="search-empty">
                  <p>No results found for &ldquo;{query}&rdquo;</p>
                  <p className="search-empty-hint">
                    Try searching for a table name, patient MRN, or field value
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="global-search-footer">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>ESC Close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
```

```css
/* Global Search */
.global-search-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.global-search-trigger:hover {
  border-color: #cbd5e1;
  background: #f1f5f9;
}

.search-trigger-text {
  flex: 1;
}

.search-shortcut {
  padding: 0.125rem 0.375rem;
  background: #e2e8f0;
  border-radius: 4px;
  font-size: 0.625rem;
  color: #64748b;
}

.global-search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  padding-top: 10vh;
}

.global-search-modal {
  width: 100%;
  max-width: 640px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.global-search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
}

.search-icon {
  font-size: 1.125rem;
  color: #94a3b8;
}

.global-search-input {
  flex: 1;
  border: none;
  font-size: 1rem;
  color: #1e293b;
  outline: none;
  background: transparent;
}

.global-search-input::placeholder {
  color: #94a3b8;
}

.search-spinner {
  animation: spin 1s linear infinite;
  color: #94a3b8;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.search-esc {
  padding: 0.125rem 0.375rem;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 0.625rem;
  color: #94a3b8;
}

.global-search-results {
  max-height: 60vh;
  overflow-y: auto;
}

.search-section-title {
  padding: 0.75rem 1.25rem 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.search-suggestion-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  color: #475569;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.search-suggestion-item:hover {
  background: #f8fafc;
}

.search-result-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  cursor: pointer;
  transition: background-color 0.1s ease;
  border-left: 3px solid transparent;
}

.search-result-item:hover,
.search-result-item.selected {
  background: #f8fafc;
  border-left-color: #3b82f6;
}

.result-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-subtitle {
  font-size: 0.75rem;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-highlights {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #475569;
}

.result-highlights mark {
  background: #fef3c7;
  padding: 0 2px;
  border-radius: 2px;
}

.result-type {
  flex-shrink: 0;
  padding: 0.125rem 0.375rem;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 0.625rem;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 500;
}

.search-empty {
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
}

.search-empty-hint {
  font-size: 0.8125rem;
  margin-top: 0.5rem;
}

.global-search-footer {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  padding: 0.625rem 1.25rem;
  border-top: 1px solid #e2e8f0;
  font-size: 0.6875rem;
  color: #94a3b8;
}
```

### 7.5 Bookmark/Favorite Records

```typescript
// BookmarkManager.ts
interface Bookmark {
  id: string;
  userId: string;
  tableName: string;
  recordId: string;
  recordLabel: string;
  tableDisplayName: string;
  createdAt: Date;
  tags: string[];
  notes: string;
  color: string;
}

interface BookmarkFolder {
  id: string;
  name: string;
  color: string;
  bookmarks: string[]; // bookmark IDs
}

class BookmarkManager {
  async addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>): Promise<Bookmark> {
    const response = await fetch('/api/v1/bookmarks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
        'X-Audit-Context': JSON.stringify({
          ...getAuditContext(),
          action: 'CREATE_BOOKMARK'
        })
      },
      body: JSON.stringify(bookmark)
    });
    
    return response.json();
  }

  async removeBookmark(bookmarkId: string): Promise<void> {
    await fetch(`/api/v1/bookmarks/${bookmarkId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'X-Audit-Context': JSON.stringify({
          ...getAuditContext(),
          action: 'DELETE_BOOKMARK'
        })
      }
    });
  }

  async listBookmarks(userId: string): Promise<Bookmark[]> {
    const response = await fetch(`/api/v1/bookmarks?userId=${userId}`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    
    return response.json();
  }

  async isBookmarked(userId: string, tableName: string, recordId: string): Promise<boolean> {
    const response = await fetch(
      `/api/v1/bookmarks/check?userId=${userId}&table=${tableName}&record=${recordId}`,
      { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }
    );
    
    const data = await response.json();
    return data.isBookmarked;
  }
}

// Bookmark Button Component
const BookmarkButton: React.FC<{
  tableName: string;
  recordId: string;
  recordLabel: string;
  tableDisplayName: string;
}> = ({ tableName, recordId, recordLabel, tableDisplayName }) => {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const manager = useRef(new BookmarkManager()).current;

  useEffect(() => {
    checkBookmarkStatus();
  }, [tableName, recordId]);

  const checkBookmarkStatus = async () => {
    const bookmarked = await manager.isBookmarked(getCurrentUserId(), tableName, recordId);
    setIsBookmarked(bookmarked);
  };

  const toggleBookmark = async () => {
    if (isBookmarked) {
      // Find and remove
      const bookmarks = await manager.listBookmarks(getCurrentUserId());
      const existing = bookmarks.find(b => b.tableName === tableName && b.recordId === recordId);
      if (existing) {
        await manager.removeBookmark(existing.id);
      }
    } else {
      await manager.addBookmark({
        userId: getCurrentUserId(),
        tableName,
        recordId,
        recordLabel,
        tableDisplayName,
        tags: [],
        notes: '',
        color: '#3b82f6'
      });
    }
    setIsBookmarked(!isBookmarked);
  };

  return (
    <div className="bookmark-button-wrapper">
      <button
        className={`bookmark-button ${isBookmarked ? 'bookmarked' : ''}`}
        onClick={toggleBookmark}
        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      >
        {isBookmarked ? '★' : '☆'}
      </button>
    </div>
  );
};

// Bookmarks Sidebar
const BookmarksSidebar: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = Array.from(new Set(bookmarks.flatMap(b => b.tags)));
  
  const filtered = bookmarks.filter(b => {
    const matchesSearch = !searchQuery || 
      b.recordLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.tableDisplayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = !selectedTag || b.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const grouped = filtered.reduce((acc, b) => {
    acc[b.tableDisplayName] = acc[b.tableDisplayName] || [];
    acc[b.tableDisplayName].push(b);
    return acc;
  }, {} as Record<string, Bookmark[]>);

  return (
    <div className="bookmarks-sidebar">
      <div className="bookmarks-header">
        <h3>⭐ Bookmarks</h3>
        <span className="bookmarks-count">{bookmarks.length}</span>
      </div>
      
      <input
        type="text"
        className="bookmarks-search"
        placeholder="Filter bookmarks..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      
      {allTags.length > 0 && (
        <div className="bookmarks-tags">
          <button 
            className={`tag-filter ${!selectedTag ? 'active' : ''}`}
            onClick={() => setSelectedTag(null)}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              className={`tag-filter ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      
      <div className="bookmarks-list">
        {Object.entries(grouped).map(([tableName, tableBookmarks]) => (
          <div key={tableName} className="bookmarks-group">
            <div className="bookmarks-group-title">{tableName}</div>
            {tableBookmarks.map(bookmark => (
              <div 
                key={bookmark.id} 
                className="bookmark-item"
                onClick={() => navigateTo(`/tables/${bookmark.tableName}/rows/${bookmark.recordId}`)}
              >
                <span 
                  className="bookmark-color"
                  style={{ backgroundColor: bookmark.color }}
                />
                <span className="bookmark-label">{bookmark.recordLabel}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
```

```css
/* Bookmark Button */
.bookmark-button-wrapper {
  display: inline-flex;
}

.bookmark-button {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem;
  color: #cbd5e1;
  transition: all 0.15s ease;
  line-height: 1;
}

.bookmark-button:hover {
  color: #f59e0b;
  transform: scale(1.1);
}

.bookmark-button.bookmarked {
  color: #f59e0b;
}

.bookmark-button.bookmarked:hover {
  color: #d97706;
}

/* Bookmarks Sidebar */
.bookmarks-sidebar {
  width: 260px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
}

.bookmarks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.bookmarks-header h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
}

.bookmarks-count {
  background: #e2e8f0;
  color: #475569;
  padding: 0.0625rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 500;
}

.bookmarks-search {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
}

.bookmarks-search:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.bookmarks-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.tag-filter {
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tag-filter:hover {
  background: #f8fafc;
}

.tag-filter.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1e40af;
}

.bookmarks-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.bookmarks-group {
  margin-bottom: 0.75rem;
}

.bookmarks-group-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  padding: 0.375rem 0;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 0.25rem;
}

.bookmark-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8125rem;
  color: #475569;
  transition: all 0.15s ease;
}

.bookmark-item:hover {
  background: #f8fafc;
  color: #1e293b;
}

.bookmark-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.bookmark-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

## 8. Performance Patterns

### 8.1 Virtual Scrolling

Virtual scrolling renders only the visible rows of large datasets, dramatically improving performance for tables with thousands of rows.

```typescript
// VirtualScroller.ts
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface VirtualScrollerProps<T> {
  items: T[];
  rowHeight: number;
  overscan?: number;     // Number of extra rows to render above/below viewport
  renderRow: (item: T, index: number) => React.ReactNode;
  containerHeight: number;
  onScrollEnd?: () => void;  // Callback for infinite scroll
}

function VirtualScroller<T>({
  items,
  rowHeight,
  overscan = 5,
  renderRow,
  containerHeight,
  onScrollEnd
}: VirtualScrollerProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const totalHeight = items.length * rowHeight;
  
  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / rowHeight) + overscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  
  const visibleItems = useMemo(() => 
    items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );
  
  const offsetY = startIndex * rowHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    
    // Infinite scroll trigger
    if (onScrollEnd) {
      const scrollBottom = newScrollTop + containerHeight;
      const threshold = totalHeight * 0.8;
      if (scrollBottom >= threshold) {
        onScrollEnd();
      }
    }
  }, [containerHeight, totalHeight, onScrollEnd]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!containerRef.current) return;
    
    const scrollAmount = rowHeight * 3;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        containerRef.current.scrollTop += rowHeight;
        break;
      case 'ArrowUp':
        e.preventDefault();
        containerRef.current.scrollTop -= rowHeight;
        break;
      case 'PageDown':
        e.preventDefault();
        containerRef.current.scrollTop += scrollAmount;
        break;
      case 'PageUp':
        e.preventDefault();
        containerRef.current.scrollTop -= scrollAmount;
        break;
      case 'Home':
        e.preventDefault();
        containerRef.current.scrollTop = 0;
        break;
      case 'End':
        e.preventDefault();
        containerRef.current.scrollTop = totalHeight;
        break;
    }
  }, [rowHeight, totalHeight]);

  return (
    <div
      ref={containerRef}
      className="virtual-scroller"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Data table"
      aria-rowcount={items.length}
    >
      <div className="virtual-scroller-content" style={{ height: totalHeight }}>
        <div 
          className="virtual-scroller-viewport"
          style={{ transform: `translateY(${offsetY}px)` }}
        >
          {visibleItems.map((item, idx) => {
            const actualIndex = startIndex + idx;
            return (
              <div 
                key={actualIndex}
                className="virtual-scroller-row"
                style={{ height: rowHeight }}
                role="row"
                aria-rowindex={actualIndex + 1}
              >
                {renderRow(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Scroll progress indicator */}
      <ScrollProgress 
        current={Math.floor(scrollTop / rowHeight) + 1} 
        total={items.length} 
      />
    </div>
  );
}

const ScrollProgress: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <div className="scroll-progress">
      <div className="scroll-progress-bar" style={{ width: `${percentage}%` }} />
      <span className="scroll-progress-text">
        {current.toLocaleString()} / {total.toLocaleString()}
      </span>
    </div>
  );
};

// Usage in DataTable
const VirtualDataTable: React.FC<{
  columns: Column[];
  rows: any[];
  rowHeight?: number;
}> = ({ columns, rows, rowHeight = 44 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  return (
    <div ref={containerRef} className="data-table-container" style={{ height: '100%' }}>
      {/* Header */}
      <div className="data-table-header">
        {columns.map(col => (
          <div 
            key={col.name} 
            className="data-table-header-cell"
            style={{ width: col.width }}
          >
            {col.displayName || col.name}
            {col.sortable && <span className="sort-indicator">↕</span>}
          </div>
        ))}
      </div>
      
      {/* Virtual Body */}
      <VirtualScroller
        items={rows}
        rowHeight={rowHeight}
        containerHeight={containerHeight - 44} // Subtract header height
        renderRow={(row, index) => (
          <div className="data-table-row">
            {columns.map(col => (
              <div 
                key={col.name} 
                className={`data-table-cell ${col.className || ''}`}
                style={{ width: col.width }}
              >
                {col.render ? col.render(row[col.name], row) : row[col.name]}
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
};
```

```css
/* Virtual Scroller */
.virtual-scroller {
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  outline: none;
}

.virtual-scroller:focus {
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.virtual-scroller-content {
  position: relative;
  width: 100%;
}

.virtual-scroller-viewport {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  will-change: transform;
}

.virtual-scroller-row {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  transition: background-color 0.1s ease;
}

.virtual-scroller-row:hover {
  background-color: #f8fafc;
}

.scroll-progress {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  border-top: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  gap: 0.5rem;
}

.scroll-progress-bar {
  height: 3px;
  background: #3b82f6;
  border-radius: 9999px;
  transition: width 0.1s ease;
}

.scroll-progress-text {
  font-size: 0.6875rem;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

/* Data Table */
.data-table-container {
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
}

.data-table-header {
  display: flex;
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  flex-shrink: 0;
}

.data-table-header-cell {
  padding: 0.625rem 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.data-table-header-cell:hover {
  background: #f1f5f9;
}

.data-table-row {
  display: flex;
  font-size: 0.8125rem;
  color: #334155;
}

.data-table-cell {
  padding: 0.625rem 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sort-indicator {
  opacity: 0.4;
  font-size: 0.625rem;
}
```

### 8.2 Lazy Loading

```typescript
// LazyLoader.ts
interface LazyLoadConfig {
  batchSize: number;
  threshold: number;     // pixels from bottom to trigger load
  maxRetries: number;
  retryDelay: number;
}

interface LazyLoadState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number | null;
  cursor: string | null;  // Cursor for cursor-based pagination
}

class LazyLoader<T> {
  private state: LazyLoadState<T>;
  private config: LazyLoadConfig;
  private fetchFn: (params: { cursor: string | null; limit: number }) => Promise<{
    items: T[];
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }>;
  private retries: number = 0;

  constructor(
    config: Partial<LazyLoadConfig>,
    fetchFn: LazyLoader<T>['fetchFn']
  ) {
    this.config = {
      batchSize: 50,
      threshold: 200,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
    this.fetchFn = fetchFn;
    this.state = {
      items: [],
      loading: false,
      error: null,
      hasMore: true,
      totalCount: null,
      cursor: null
    };
  }

  async loadMore(): Promise<void> {
    if (this.state.loading || !this.state.hasMore) return;

    this.state = { ...this.state, loading: true, error: null };

    try {
      const response = await this.fetchFn({
        cursor: this.state.cursor,
        limit: this.config.batchSize
      });

      this.state = {
        ...this.state,
        items: [...this.state.items, ...response.items],
        cursor: response.cursor,
        hasMore: response.hasMore,
        totalCount: response.totalCount,
        loading: false
      };
      this.retries = 0;
    } catch (err) {
      this.retries++;
      if (this.retries < this.config.maxRetries) {
        setTimeout(() => this.loadMore(), this.config.retryDelay * this.retries);
      } else {
        this.state = {
          ...this.state,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load data'
        };
      }
    }
  }

  reset(): void {
    this.state = {
      items: [],
      loading: false,
      error: null,
      hasMore: true,
      totalCount: null,
      cursor: null
    };
    this.retries = 0;
  }

  getState(): LazyLoadState<T> {
    return { ...this.state };
  }
}

// React Hook for lazy loading
function useLazyLoad<T>(
  fetchFn: LazyLoader<T>['fetchFn'],
  config?: Partial<LazyLoadConfig>
) {
  const loaderRef = useRef(new LazyLoader<T>(config || {}, fetchFn));
  const [state, setState] = useState<LazyLoadState<T>>(loaderRef.current.getState());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    await loaderRef.current.loadMore();
    setState(loaderRef.current.getState());
  }, []);

  const reset = useCallback(() => {
    loaderRef.current.reset();
    setState(loaderRef.current.getState());
  }, []);

  // IntersectionObserver for auto-trigger
  useEffect(() => {
    if (!sentinelRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: `${config?.threshold || 200}px` }
    );

    observerRef.current.observe(sentinelRef.current);

    return () => observerRef.current?.disconnect();
  }, [loadMore, config?.threshold]);

  return { ...state, loadMore, reset, sentinelRef };
}
```

### 8.3 Cursor-Based Pagination

```typescript
// CursorPagination.ts
interface CursorPaginationParams {
  limit: number;
  cursor?: string;
  direction: 'forward' | 'backward';
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  totalCount: number;
  hasMore: boolean;
}

// Server-side cursor pagination for PostgreSQL
class CursorPaginationEngine {
  async paginate<T>(
    tableName: string,
    params: CursorPaginationParams,
    filters?: string[],
    filterParams?: any[]
  ): Promise<CursorPaginationResult<T>> {
    const { limit, cursor, direction, sortField, sortDirection } = params;
    const sortOp = sortDirection === 'asc' ? '>' : '<';
    const reverseSortOp = sortDirection === 'asc' ? '<' : '>';

    // Build WHERE clause
    const whereConditions: string[] = filters || [];
    const queryParams: any[] = filterParams ? [...filterParams] : [];

    if (cursor) {
      const cursorParamIdx = queryParams.length + 1;
      whereConditions.push(`("${sortField}", id) ${direction === 'forward' ? sortOp : reverseSortOp} ($${cursorParamIdx}, $${cursorParamIdx + 1})`);
      const decodedCursor = this.decodeCursor(cursor);
      queryParams.push(decodedCursor.value, decodedCursor.id);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Fetch one extra to determine if there are more results
    const fetchLimit = limit + 1;
    const limitParamIdx = queryParams.length + 1;

    const query = `
      SELECT *
      FROM "${tableName}"
      ${whereClause}
      ORDER BY "${sortField}" ${sortDirection}, id ${sortDirection}
      LIMIT $${limitParamIdx}
    `;
    queryParams.push(fetchLimit);

    const result = await db.query(query, queryParams);
    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Get total count (can be cached)
    const countResult = await db.query(
      `SELECT COUNT(*)::int as count FROM "${tableName}" ${whereClause}`,
      filterParams || []
    );
    const totalCount = countResult.rows[0]?.count || 0;

    // Generate cursors
    const nextCursor = hasMore && items.length > 0 
      ? this.encodeCursor(items[items.length - 1][sortField], items[items.length - 1].id)
      : null;

    const prevCursor = cursor 
      ? this.encodeCursor(items[0]?.[sortField], items[0]?.id)
      : null;

    return {
      items,
      nextCursor,
      prevCursor,
      totalCount,
      hasMore
    };
  }

  private encodeCursor(value: any, id: string): string {
    const payload = JSON.stringify({ value, id, ts: Date.now() });
    return btoa(payload);
  }

  private decodeCursor(cursor: string): { value: any; id: string } {
    try {
      const payload = atob(cursor);
      const parsed = JSON.parse(payload);
      return { value: parsed.value, id: parsed.id };
    } catch {
      throw new Error('Invalid cursor');
    }
  }
}

// Pagination Component
const CursorPagination: React.FC<{
  currentCursor: string | null;
  nextCursor: string | null;
  prevCursor: string | null;
  totalCount: number;
  pageSize: number;
  loadedCount: number;
  onNext: () => void;
  onPrev: () => void;
  onFirst: () => void;
}> = ({
  nextCursor,
  prevCursor,
  totalCount,
  pageSize,
  loadedCount,
  onNext,
  onPrev,
  onFirst
}) => {
  return (
    <div className="cursor-pagination">
      <div className="pagination-info">
        <span className="pagination-count">
          Showing {loadedCount.toLocaleString()} of {totalCount.toLocaleString()} records
        </span>
        <span className="pagination-page-size">{pageSize} per page</span>
      </div>
      
      <div className="pagination-controls">
        <button 
          className="pagination-btn"
          onClick={onFirst}
          disabled={!prevCursor}
          title="First page"
        >
          ⏮ First
        </button>
        <button 
          className="pagination-btn"
          onClick={onPrev}
          disabled={!prevCursor}
          title="Previous page"
        >
          ◀ Prev
        </button>
        <button 
          className="pagination-btn"
          onClick={onNext}
          disabled={!nextCursor}
          title="Next page"
        >
          Next ▶
        </button>
      </div>
    </div>
  );
};
```

```css
/* Cursor Pagination */
.cursor-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.pagination-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: #64748b;
}

.pagination-count {
  font-variant-numeric: tabular-nums;
}

.pagination-page-size {
  padding: 0.125rem 0.5rem;
  background: #e2e8f0;
  border-radius: 4px;
  font-size: 0.75rem;
}

.pagination-controls {
  display: flex;
  gap: 0.375rem;
}

.pagination-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  font-size: 0.8125rem;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pagination-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

### 8.4 Search Debouncing

```typescript
// DebouncedSearch.ts
import { useState, useEffect, useRef, useCallback } from 'react';

interface DebouncedSearchConfig {
  delay: number;
  minLength: number;
  maxLength: number;
}

function useDebouncedSearch<T>(
  searchFn: (query: string) => Promise<T[]>,
  config: Partial<DebouncedSearchConfig> = {}
) {
  const {
    delay = 300,
    minLength = 2,
    maxLength = 200
  } = config;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef('');

  const executeSearch = useCallback(async (searchQuery: string) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const data = await searchFn(searchQuery);
      // Only update if this is still the latest query
      if (searchQuery === lastQueryRef.current) {
        setResults(data);
      }
    } catch (err) {
      if (searchQuery === lastQueryRef.current) {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    } finally {
      if (searchQuery === lastQueryRef.current) {
        setLoading(false);
      }
    }
  }, [searchFn]);

  useEffect(() => {
    lastQueryRef.current = query;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length < minLength) {
      setResults([]);
      setLoading(false);
      return;
    }

    if (query.length > maxLength) {
      setError(`Query too long (max ${maxLength} characters)`);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      executeSearch(query);
    }, delay);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, delay, minLength, maxLength, executeSearch]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    clearSearch
  };
}

// Optimized Search Input
const OptimizedSearchInput: React.FC<{
  placeholder?: string;
  onSearch: (query: string) => Promise<any[]>;
  onSelect: (result: any) => void;
  debounceMs?: number;
}> = ({ placeholder = 'Search...', onSearch, onSelect, debounceMs = 250 }) => {
  const {
    query,
    setQuery,
    results,
    loading,
    error,
    clearSearch
  } = useDebouncedSearch(onSearch, { delay: debounceMs });

  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className={`search-input-container ${isFocused ? 'focused' : ''}`}>
      <div className="search-input-wrapper">
        <span className="search-input-icon">🔍</span>
        <input
          type="text"
          className="search-input-field"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        />
        {loading && <span className="search-input-spinner">⟳</span>}
        {query && (
          <button className="search-input-clear" onClick={clearSearch}>×</button>
        )}
      </div>
      
      {isFocused && results.length > 0 && (
        <div className="search-input-dropdown">
          {results.map((result, idx) => (
            <div 
              key={idx}
              className="search-input-result"
              onMouseDown={() => onSelect(result)}
            >
              {result}
            </div>
          ))}
        </div>
      )}
      
      {error && (
        <div className="search-input-error">{error}</div>
      )}
    </div>
  );
};
```

### 8.5 Cache Strategies

```typescript
// CacheManager.ts
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  version: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  staleWhileRevalidate: boolean;
}

class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private config: CacheConfig;
  private version: number = 1;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      staleWhileRevalidate: true,
      ...config
    };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    // Check if entry is expired
    if (this.isExpired(entry)) {
      if (this.config.staleWhileRevalidate) {
        // Return stale data and trigger refresh in background
        this.refreshInBackground(key);
        return entry.value;
      }
      this.delete(key);
      return undefined;
    }
    
    // Update access order for LRU
    this.updateAccessOrder(key);
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      version: this.version
    });
    
    this.updateAccessOrder(key);
  }

  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    return existed;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  invalidate(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.delete(key);
      }
    }
  }

  bumpVersion(): void {
    this.version++;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  private evictLRU(): void {
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  private refreshInBackground(key: string): void {
    // This would trigger a background refresh
    // Implementation depends on the data source
    console.log(`Cache stale for ${key}, triggering background refresh`);
  }

  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; age: number; ttl: number }>;
  } {
    const now = Date.now();
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: 0, // Would need hit/miss tracking
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: now - entry.timestamp,
        ttl: entry.ttl
      }))
    };
  }
}

// Specialized cache for table data
const tableDataCache = new CacheManager<any[]>({
  maxSize: 100,
  defaultTTL: 60 * 1000, // 1 minute
  staleWhileRevalidate: true
});

const schemaCache = new CacheManager<any>({
  maxSize: 50,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  staleWhileRevalidate: false
});

const rowCountCache = new CacheManager<number>({
  maxSize: 200,
  defaultTTL: 10 * 60 * 1000, // 10 minutes
  staleWhileRevalidate: true
});
```

### 8.6 Offline Support

```typescript
// OfflineSupport.ts
interface OfflineConfig {
  enableSync: boolean;
  maxQueueSize: number;
  syncInterval: number;  // ms
  conflictResolution: 'server-wins' | 'client-wins' | 'manual';
}

interface QueuedOperation {
  id: string;
  type: 'query' | 'view' | 'bookmark';
  tableName: string;
  params: any;
  timestamp: number;
  retryCount: number;
}

class OfflineManager {
  private db: IDBDatabase | null = null;
  private config: OfflineConfig;
  private queue: QueuedOperation[] = [];
  private isOnline: boolean = navigator.onLine;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<OfflineConfig> = {}) {
    this.config = {
      enableSync: true,
      maxQueueSize: 1000,
      syncInterval: 30 * 1000,
      conflictResolution: 'server-wins',
      ...config
    };

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ClinicDataExplorer', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store for cached table data
        if (!db.objectStoreNames.contains('tableData')) {
          const tableDataStore = db.createObjectStore('tableData', { keyPath: 'cacheKey' });
          tableDataStore.createIndex('tableName', 'tableName', { unique: false });
          tableDataStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Store for queued operations
        if (!db.objectStoreNames.contains('operationQueue')) {
          db.createObjectStore('operationQueue', { keyPath: 'id', autoIncrement: true });
        }
        
        // Store for metadata
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  async cacheTableData(
    tableName: string, 
    query: string, 
    data: any[], 
    metadata: any
  ): Promise<void> {
    if (!this.db) return;

    const cacheKey = `${tableName}:${this.hashQuery(query)}`;
    const tx = this.db.transaction('tableData', 'readwrite');
    const store = tx.objectStore('tableData');

    await store.put({
      cacheKey,
      tableName,
      data,
      metadata,
      timestamp: Date.now()
    });
  }

  async getCachedTableData(tableName: string, query: string): Promise<any[] | null> {
    if (!this.db) return null;

    const cacheKey = `${tableName}:${this.hashQuery(query)}`;
    const tx = this.db.transaction('tableData', 'readonly');
    const store = tx.objectStore('tableData');
    
    const result = await store.get(cacheKey);
    return result?.data || null;
  }

  async queueOperation(operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    if (!this.db) return;

    const fullOperation: QueuedOperation = {
      ...operation,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retryCount: 0
    };

    const tx = this.db.transaction('operationQueue', 'readwrite');
    const store = tx.objectStore('operationQueue');
    await store.put(fullOperation);
    this.queue.push(fullOperation);
  }

  private async syncQueue(): Promise<void> {
    if (!this.db || !this.isOnline || this.queue.length === 0) return;

    const tx = this.db.transaction('operationQueue', 'readwrite');
    const store = tx.objectStore('operationQueue');

    for (const operation of [...this.queue]) {
      try {
        await this.executeRemote(operation);
        await store.delete(operation.id);
        this.queue = this.queue.filter(o => o.id !== operation.id);
      } catch (err) {
        operation.retryCount++;
        if (operation.retryCount > 3) {
          // Move to failed queue
          await store.delete(operation.id);
          this.queue = this.queue.filter(o => o.id !== operation.id);
        } else {
          await store.put(operation);
        }
      }
    }
  }

  private async executeRemote(operation: QueuedOperation): Promise<void> {
    const response = await fetch('/api/v1/operations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify(operation)
    });

    if (!response.ok) {
      throw new Error(`Operation failed: ${response.statusText}`);
    }
  }

  private handleOnline(): void {
    this.isOnline = true;
    if (this.config.enableSync) {
      this.syncQueue();
      this.syncInterval = setInterval(() => this.syncQueue(), this.config.syncInterval);
    }
  }

  private handleOffline(): void {
    this.isOnline = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  getStatus(): { isOnline: boolean; queueSize: number; cachedTables: number } {
    return {
      isOnline: this.isOnline,
      queueSize: this.queue.length,
      cachedTables: 0 // Would need to query IndexedDB
    };
  }
}

// Offline Status Indicator
const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSynced, setShowSynced] = useState(false);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setShowSynced(true); setTimeout(() => setShowSynced(false), 3000); };
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className={`offline-indicator ${isOnline ? 'online' : 'offline'}`}>
      {!isOnline ? (
        <>
          <span className="offline-dot" />
          <span>Offline Mode</span>
        </>
      ) : showSynced ? (
        <>
          <span>✓ Synced</span>
        </>
      ) : null}
    </div>
  );
};
```

```css
/* Offline Indicator */
.offline-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.3s ease;
}

.offline-indicator.offline {
  background: #fef3c7;
  color: #92400e;
  animation: pulse 2s infinite;
}

.offline-indicator.online {
  background: #dcfce7;
  color: #166534;
}

.offline-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

---

## Appendix A: HIPAA Compliance Checklist

| Requirement | Implementation |
|------------|----------------|
| Access Controls (§164.312(a)(1)) | Role-based field visibility, RBAC policies |
| Audit Controls (§164.312(b)) | All field reveals logged, query audit trail |
| Integrity (§164.312(c)(1)) | Row-level versioning, change tracking |
| Person/Entity Authentication (§164.312(d)) | JWT tokens, session management |
| Transmission Security (§164.312(e)(1)) | TLS 1.3, encrypted at rest |
| Minimum Necessary (§164.502(b)) | Role-based column filtering, row-level security |
| De-identification (§164.514) | Field masking engine, PHI classification |

## Appendix B: GDPR Compliance Checklist

| Requirement | Implementation |
|------------|----------------|
| Lawful Basis (Art. 6) | Consent tracking, legitimate interest assessment |
| Data Minimization (Art. 5(1)(c)) | Configurable field visibility, query restrictions |
| Purpose Limitation (Art. 5(1)(b)) | Role-based access, query justification |
| Right to Access (Art. 15) | Patient portal, data export |
| Right to Rectification (Art. 16) | Audit trail for corrections |
| Right to Erasure (Art. 17) | Soft delete with audit trail |
| Data Portability (Art. 20) | JSON/CSV export with masking |
| Privacy by Design (Art. 25) | Default masking, PHI auto-classification |

## Appendix C: Technology Stack Recommendations

| Layer | Technology | License |
|-------|-----------|---------|
| Frontend Framework | React 18+ | MIT |
| Type System | TypeScript 5.x | Apache-2.0 |
| State Management | Zustand | MIT |
| Query Builder | React Query (TanStack) | MIT |
| Virtual Scrolling | @tanstack/react-virtual | MIT |
| Date Picker | @mui/x-date-pickers | MIT |
| Drag & Drop | @dnd-kit/core | MIT |
| Icons | Lucide React | ISC |
| Styling | CSS Modules / Tailwind | MIT |
| Backend API | Express.js / Fastify | MIT |
| Database | PostgreSQL 16+ | PostgreSQL License |
| Search | Elasticsearch 8+ | SSPL/Elastic |
| Cache | Redis 7+ | BSD-3 |
| Authentication | Keycloak | Apache-2.0 |

## Appendix D: Performance Benchmarks

| Metric | Target | Threshold |
|--------|--------|-----------|
| Initial page load | < 2s | < 5s |
| Table data fetch (100 rows) | < 200ms | < 500ms |
| Virtual scroll (1M rows) | 60fps | > 30fps |
| Search response | < 100ms | < 300ms |
| Filter application | < 50ms | < 200ms |
| Row detail open | < 300ms | < 1s |
| Schema graph render | < 1s | < 3s |
| Export (10k rows) | < 5s | < 15s |

---

*Document Version: 1.0*  
*Last Updated: 2025*  
*Classification: Internal Design Document*
