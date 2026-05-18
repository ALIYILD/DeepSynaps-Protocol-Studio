"""
DeepSynaps Evidence Store — SQLite-backed intelligence database

Manages canonical clinical records from all 66 adapters.
Schema: evidence_entries, adapter_metadata, cache_metadata
"""

import sqlite3
import json
import threading
from typing import List, Dict, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class EvidenceStore:
    """Thread-safe SQLite-backed evidence store manager."""

    def __init__(self, db_path: str = "/data/evidence.db"):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Create a new SQLite connection with row factory."""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Initialize SQLite database with schema."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Main evidence entries table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evidence_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                adapter_key TEXT NOT NULL,
                source_database TEXT NOT NULL,
                source_id TEXT,
                source_url TEXT,
                entity_type TEXT NOT NULL,
                title TEXT,
                abstract TEXT,
                value TEXT,
                unit TEXT,
                confidence_overall REAL,
                confidence_data_quality REAL,
                confidence_evidence_strength REAL,
                confidence_sample_size REAL,
                confidence_replication REAL,
                confidence_consistency REAL,
                confidence_temporal REAL,
                confidence_population REAL,
                data_json TEXT,
                provenance_json TEXT,
                retrieved_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Adapter metadata table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS adapter_metadata (
                adapter_key TEXT PRIMARY KEY,
                adapter_name TEXT,
                adapter_version TEXT,
                source_url TEXT,
                last_run_at TEXT,
                records_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                config_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Cache metadata table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cache_metadata (
                cache_key TEXT PRIMARY KEY,
                cache_value TEXT,
                expires_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes for performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_adapter ON evidence_entries(adapter_key)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_entity ON evidence_entries(entity_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_database ON evidence_entries(source_database)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_confidence ON evidence_entries(confidence_overall)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_created ON evidence_entries(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_source_id ON evidence_entries(source_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_title ON evidence_entries(title)")

        conn.commit()
        conn.close()

    def insert(self, record: Dict) -> int:
        """Insert a single evidence record. Returns row ID."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO evidence_entries (
                        adapter_key, source_database, source_id, source_url,
                        entity_type, title, abstract, value, unit,
                        confidence_overall, confidence_data_quality, confidence_evidence_strength,
                        confidence_sample_size, confidence_replication, confidence_consistency,
                        confidence_temporal, confidence_population,
                        data_json, provenance_json, retrieved_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    record["adapter_key"], record["source_database"], record.get("source_id"),
                    record.get("source_url"), record["entity_type"], record.get("title"),
                    record.get("abstract"), record.get("value"), record.get("unit"),
                    record.get("confidence_overall"), record.get("confidence_data_quality"),
                    record.get("confidence_evidence_strength"), record.get("confidence_sample_size"),
                    record.get("confidence_replication"), record.get("confidence_consistency"),
                    record.get("confidence_temporal"), record.get("confidence_population"),
                    json.dumps(record.get("data", {})), json.dumps(record.get("provenance", {})),
                    record.get("retrieved_at", datetime.utcnow().isoformat())
                ))
                row_id = cursor.lastrowid
                conn.commit()
                return row_id
            except Exception as e:
                conn.rollback()
                logger.error(f"Error inserting record: {e}")
                raise
            finally:
                conn.close()

    def bulk_insert(self, records: List[Dict]) -> int:
        """Insert multiple evidence records efficiently. Returns count inserted."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                now = datetime.utcnow().isoformat()
                rows = []
                for record in records:
                    rows.append((
                        record["adapter_key"], record["source_database"], record.get("source_id"),
                        record.get("source_url"), record["entity_type"], record.get("title"),
                        record.get("abstract"), record.get("value"), record.get("unit"),
                        record.get("confidence_overall"), record.get("confidence_data_quality"),
                        record.get("confidence_evidence_strength"), record.get("confidence_sample_size"),
                        record.get("confidence_replication"), record.get("confidence_consistency"),
                        record.get("confidence_temporal"), record.get("confidence_population"),
                        json.dumps(record.get("data", {})), json.dumps(record.get("provenance", {})),
                        record.get("retrieved_at", now)
                    ))
                cursor.executemany("""
                    INSERT INTO evidence_entries (
                        adapter_key, source_database, source_id, source_url,
                        entity_type, title, abstract, value, unit,
                        confidence_overall, confidence_data_quality, confidence_evidence_strength,
                        confidence_sample_size, confidence_replication, confidence_consistency,
                        confidence_temporal, confidence_population,
                        data_json, provenance_json, retrieved_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, rows)
                conn.commit()
                return cursor.rowcount
            except Exception as e:
                conn.rollback()
                logger.error(f"Error bulk inserting records: {e}")
                raise
            finally:
                conn.close()

    def search(
        self,
        query: Optional[str] = None,
        adapter_key: Optional[str] = None,
        entity_type: Optional[str] = None,
        min_confidence: Optional[float] = None,
        source_database: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        sort_by: str = "confidence_overall",
        sort_order: str = "desc"
    ) -> List[Dict]:
        """Search evidence entries with filters and sorting."""
        conditions = []
        params = []

        if query:
            conditions.append("(title LIKE ? OR abstract LIKE ? OR value LIKE ?)")
            like_query = f"%{query}%"
            params.extend([like_query, like_query, like_query])

        if adapter_key:
            conditions.append("adapter_key = ?")
            params.append(adapter_key)

        if entity_type:
            conditions.append("entity_type = ?")
            params.append(entity_type)

        if source_database:
            conditions.append("source_database = ?")
            params.append(source_database)

        if min_confidence is not None:
            conditions.append("confidence_overall >= ?")
            params.append(min_confidence)

        # Build WHERE clause
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        # Validate sort_by to prevent SQL injection
        allowed_sort = {
            "id", "adapter_key", "source_database", "entity_type",
            "confidence_overall", "confidence_data_quality", "confidence_evidence_strength",
            "created_at", "retrieved_at", "title"
        }
        if sort_by not in allowed_sort:
            sort_by = "confidence_overall"
        sort_order = "DESC" if sort_order.lower() == "desc" else "ASC"

        sql = f"""
            SELECT * FROM evidence_entries
            {where_clause}
            ORDER BY {sort_by} {sort_order}
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error searching records: {e}")
            raise
        finally:
            conn.close()

    def get_by_id(self, record_id: int) -> Optional[Dict]:
        """Get a single evidence record by ID."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM evidence_entries WHERE id = ?", (record_id,))
            row = cursor.fetchone()
            return self._row_to_dict(row) if row else None
        except Exception as e:
            logger.error(f"Error getting record by id: {e}")
            raise
        finally:
            conn.close()

    def get_by_adapter(self, adapter_key: str, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get all evidence from a specific adapter with pagination."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM evidence_entries
                WHERE adapter_key = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (adapter_key, limit, offset))
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting records by adapter: {e}")
            raise
        finally:
            conn.close()

    def get_by_type(self, entity_type: str, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get all evidence of a specific entity type with pagination."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM evidence_entries
                WHERE entity_type = ?
                ORDER BY confidence_overall DESC, created_at DESC
                LIMIT ? OFFSET ?
            """, (entity_type, limit, offset))
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting records by type: {e}")
            raise
        finally:
            conn.close()

    def get_by_source_database(self, source_database: str, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get all evidence from a specific source database."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM evidence_entries
                WHERE source_database = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, (source_database, limit, offset))
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error getting records by source database: {e}")
            raise
        finally:
            conn.close()

    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive evidence store statistics."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            stats = {}

            # Total count
            cursor.execute("SELECT COUNT(*) FROM evidence_entries")
            stats["total_entries"] = cursor.fetchone()[0]

            # Count by adapter
            cursor.execute("""
                SELECT adapter_key, COUNT(*) as count
                FROM evidence_entries
                GROUP BY adapter_key
                ORDER BY count DESC
            """)
            stats["by_adapter"] = {row[0]: row[1] for row in cursor.fetchall()}

            # Count by entity type
            cursor.execute("""
                SELECT entity_type, COUNT(*) as count
                FROM evidence_entries
                GROUP BY entity_type
                ORDER BY count DESC
            """)
            stats["by_entity_type"] = {row[0]: row[1] for row in cursor.fetchall()}

            # Count by source database
            cursor.execute("""
                SELECT source_database, COUNT(*) as count
                FROM evidence_entries
                GROUP BY source_database
                ORDER BY count DESC
            """)
            stats["by_source_database"] = {row[0]: row[1] for row in cursor.fetchall()}

            # Confidence statistics
            cursor.execute("""
                SELECT
                    AVG(confidence_overall) as avg_confidence,
                    MIN(confidence_overall) as min_confidence,
                    MAX(confidence_overall) as max_confidence,
                    COUNT(confidence_overall) as confidence_count
                FROM evidence_entries
                WHERE confidence_overall IS NOT NULL
            """)
            row = cursor.fetchone()
            stats["confidence_stats"] = {
                "average": row[0],
                "minimum": row[1],
                "maximum": row[2],
                "count": row[3]
            }

            # Recent activity
            cursor.execute("""
                SELECT COUNT(*) FROM evidence_entries
                WHERE created_at >= datetime('now', '-1 day')
            """)
            stats["entries_last_24h"] = cursor.fetchone()[0]

            # Adapter coverage (total unique adapters)
            cursor.execute("SELECT COUNT(DISTINCT adapter_key) FROM evidence_entries")
            stats["unique_adapters"] = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(DISTINCT entity_type) FROM evidence_entries")
            stats["unique_entity_types"] = cursor.fetchone()[0]

            # Confidence tier distribution
            cursor.execute("""
                SELECT
                    SUM(CASE WHEN confidence_overall >= 0.9 THEN 1 ELSE 0 END) as high,
                    SUM(CASE WHEN confidence_overall >= 0.7 AND confidence_overall < 0.9 THEN 1 ELSE 0 END) as medium,
                    SUM(CASE WHEN confidence_overall >= 0.4 AND confidence_overall < 0.7 THEN 1 ELSE 0 END) as low,
                    SUM(CASE WHEN confidence_overall < 0.4 OR confidence_overall IS NULL THEN 1 ELSE 0 END) as uncertain
                FROM evidence_entries
            """)
            row = cursor.fetchone()
            stats["confidence_tiers"] = {
                "high": row[0] or 0,
                "medium": row[1] or 0,
                "low": row[2] or 0,
                "uncertain": row[3] or 0
            }

            stats["generated_at"] = datetime.utcnow().isoformat()
            return stats
        except Exception as e:
            logger.error(f"Error getting stats: {e}")
            raise
        finally:
            conn.close()

    def count(self, adapter_key: Optional[str] = None,
              entity_type: Optional[str] = None,
              source_database: Optional[str] = None,
              query: Optional[str] = None) -> int:
        """Count evidence entries with optional filters (matches search semantics)."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            conditions = []
            params = []

            if query:
                conditions.append("(title LIKE ? OR abstract LIKE ? OR value LIKE ?)")
                like_query = f"%{query}%"
                params.extend([like_query, like_query, like_query])
            if adapter_key:
                conditions.append("adapter_key = ?")
                params.append(adapter_key)
            if entity_type:
                conditions.append("entity_type = ?")
                params.append(entity_type)
            if source_database:
                conditions.append("source_database = ?")
                params.append(source_database)

            where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
            cursor.execute(f"SELECT COUNT(*) FROM evidence_entries {where_clause}", params)
            return cursor.fetchone()[0]
        except Exception as e:
            logger.error(f"Error counting records: {e}")
            raise
        finally:
            conn.close()

    def update_adapter_metadata(self, adapter_key: str, metadata: Dict) -> None:
        """Update or insert adapter metadata."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO adapter_metadata (
                        adapter_key, adapter_name, adapter_version,
                        source_url, last_run_at, records_count, status, config_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    adapter_key,
                    metadata.get("adapter_name"),
                    metadata.get("adapter_version"),
                    metadata.get("source_url"),
                    metadata.get("last_run_at", datetime.utcnow().isoformat()),
                    metadata.get("records_count", 0),
                    metadata.get("status", "active"),
                    json.dumps(metadata.get("config", {}))
                ))
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"Error updating adapter metadata: {e}")
                raise
            finally:
                conn.close()

    def get_adapter_metadata(self, adapter_key: Optional[str] = None) -> List[Dict]:
        """Get adapter metadata. If adapter_key is None, returns all."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            if adapter_key:
                cursor.execute("SELECT * FROM adapter_metadata WHERE adapter_key = ?", (adapter_key,))
            else:
                cursor.execute("SELECT * FROM adapter_metadata ORDER BY adapter_key")
            rows = cursor.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                try:
                    d["config"] = json.loads(d.pop("config_json", "{}"))
                except (json.JSONDecodeError, KeyError):
                    d["config"] = {}
                result.append(d)
            return result
        except Exception as e:
            logger.error(f"Error getting adapter metadata: {e}")
            raise
        finally:
            conn.close()

    def clear(self) -> int:
        """Clear all evidence entries (for re-seeding). Returns number deleted."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM evidence_entries")
                count = cursor.fetchone()[0]
                cursor.execute("DELETE FROM evidence_entries")
                conn.commit()
                logger.info(f"Cleared {count} evidence entries")
                return count
            except Exception as e:
                conn.rollback()
                logger.error(f"Error clearing store: {e}")
                raise
            finally:
                conn.close()

    def delete_by_adapter(self, adapter_key: str) -> int:
        """Delete all entries for a specific adapter. Returns number deleted."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM evidence_entries WHERE adapter_key = ?", (adapter_key,))
                count = cursor.rowcount
                conn.commit()
                logger.info(f"Deleted {count} entries for adapter {adapter_key}")
                return count
            except Exception as e:
                conn.rollback()
                logger.error(f"Error deleting adapter records: {e}")
                raise
            finally:
                conn.close()

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert a sqlite3.Row to a dictionary with parsed JSON fields."""
        result = dict(row)
        try:
            result["data"] = json.loads(result.pop("data_json", "{}"))
        except (json.JSONDecodeError, KeyError):
            result["data"] = {}
        try:
            result["provenance"] = json.loads(result.pop("provenance_json", "{}"))
        except (json.JSONDecodeError, KeyError):
            result["provenance"] = {}
        return result

    def get_cache(self, cache_key: str) -> Optional[str]:
        """Get cached value by key, or None if expired/not found."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT cache_value, expires_at FROM cache_metadata
                WHERE cache_key = ? AND (expires_at IS NULL OR expires_at >= ?)
            """, (cache_key, datetime.utcnow().isoformat()))
            row = cursor.fetchone()
            return row[0] if row else None
        except Exception as e:
            logger.error(f"Error getting cache: {e}")
            return None
        finally:
            conn.close()

    def set_cache(self, cache_key: str, cache_value: str, ttl_seconds: Optional[int] = None) -> None:
        """Set cached value with optional TTL."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                expires_at = None
                if ttl_seconds:
                    from datetime import timedelta
                    expires_at = (datetime.utcnow() + timedelta(seconds=ttl_seconds)).isoformat()
                cursor.execute("""
                    INSERT OR REPLACE INTO cache_metadata (cache_key, cache_value, expires_at)
                    VALUES (?, ?, ?)
                """, (cache_key, cache_value, expires_at))
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"Error setting cache: {e}")
                raise
            finally:
                conn.close()
