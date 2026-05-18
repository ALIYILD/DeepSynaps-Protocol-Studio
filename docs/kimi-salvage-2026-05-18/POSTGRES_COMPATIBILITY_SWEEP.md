# PostgreSQL Compatibility Sweep

## Results

| Check | Status | Details |
|-------|--------|---------|
| SQLite `sqlite3` import | Pass | Replaced with `database` adapter in all engines |
| SQLite-specific PRAGMA | Pass | Guarded with `if self.dialect == "sqlite"` |
| AUTOINCREMENT | Pass | Adapted to SERIAL for PostgreSQL |
| INSERT OR IGNORE | Pass | Adapted to INSERT ... ON CONFLICT for PostgreSQL |
| `?` placeholders | Pass | Converted to `%s` for PostgreSQL |
| `row_factory = sqlite3.Row` | Pass | Handled in `ConnectionProxy.cursor()` |
| Raw `sqlite3.connect()` calls | Pass | All replaced with `database.connect()` |
| `conn.row_factory` access | Pass | Fixed in ConnectionProxy |
| Boolean columns (INTEGER 0/1) | Pass | psycopg2 handles casting |
| JSON columns (TEXT) | Pass | String storage works for both dialects |

## Dialect-Aware SQL Adaptation

```python
# SQLite (dev/test)
"INSERT OR IGNORE INTO evidence_db VALUES (?,?,?,?,?,?,?,?,?,?)"

# PostgreSQL (production)
"INSERT INTO evidence_db VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
"ON CONFLICT (evidence_id) DO NOTHING"
```

## Minimal Patch Approach

The migration preserves all existing behavior:
- All method signatures unchanged
- All test assertions unchanged
- SQLite dev/test workflow unchanged
- Only connection layer changed (sqlite3.connect → database.connect)
- SQL queries adapted at runtime based on active dialect
