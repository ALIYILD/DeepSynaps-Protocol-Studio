# SQLite to PostgreSQL Migration Plan

## Zero-Downtime Strategy

### Phase 1: Preparation (before migration day)

1. **Deploy PostgreSQL** — Set up PostgreSQL instance
2. **Install psycopg2** — `pip install psycopg2-binary`
3. **Validate connectivity** — Run smoke tests against PostgreSQL:
   ```bash
   DATABASE_URL=postgresql://user:pass@host/db python3 -m pytest apps/api/tests/test_database_postgres_smoke.py -v
   ```
4. **Export SQLite data** — `sqlite3 deepsynaps.db ".dump" > export.sql`
5. **Clean export** — Remove SQLite-specific pragmas, adapt types

### Phase 2: Data Migration (migration day)

1. **Maintenance window** — Notify users
2. **Lock application** — Set `DEEPSYNAPS_APP_ENV=maintenance`
3. **Run migration script**:
   ```bash
   python3 tools/migrate_sqlite_to_postgres.py \
     --sqlite deepsynaps.db \
     --postgres "postgresql://user:pass@host/db"
   ```
4. **Verify data** — Row counts match for each table
5. **Switch DATABASE_URL** — Point app to PostgreSQL
6. **Restart application** — `DEEPSYNAPS_APP_ENV=production`

### Phase 3: Validation (after migration)

1. **Health check** — `curl /health` confirms "dialect": "postgresql"
2. **Smoke tests** — Run full test suite against PostgreSQL
3. **Feature validation** — Key user workflows
4. **Monitor** — Watch error rates, query performance

## Migration Script Template

```python
# tools/migrate_sqlite_to_postgres.py
import sqlite3
import psycopg2
import argparse


def migrate(sqlite_path: str, postgres_url: str):
    # Connect to SQLite
    src = sqlite3.connect(sqlite_path)
    src.row_factory = sqlite3.Row

    # Connect to PostgreSQL
    dst = psycopg2.connect(postgres_url)

    tables = [
        "multimodal_events", "evidence_db", "patient_access",
        "audit_log", "deeptwin_reviews", "deeptwin_tasks",
    ]

    cur = dst.cursor()
    for table in tables:
        rows = src.execute(f"SELECT * FROM {table}").fetchall()
        print(f"Migrating {table}: {len(rows)} rows")

        for row in rows:
            cols = ", ".join(row.keys())
            placeholders = ", ".join(["%s"] * len(row))
            cur.execute(
                f"INSERT INTO {table} ({cols}) VALUES ({placeholders})",
                tuple(row)
            )

    dst.commit()
    print("Migration complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", required=True)
    parser.add_argument("--postgres", required=True)
    args = parser.parse_args()
    migrate(args.sqlite, args.postgres)
```

## Rollback Plan

If migration fails:
1. Revert `DATABASE_URL` to SQLite path
2. Restart application
3. Investigate PostgreSQL issues
4. Retry migration during next window
