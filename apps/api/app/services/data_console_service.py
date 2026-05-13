"""Safe read-only data console service.

Provides masked, allowlist-gated access to patient data for clinician review:
- Data source discovery (available tables)
- Row fetching with PHI masking
- Safety validation (no raw SQL, no cross-clinic access)
- Audit logging of all access
"""
import csv
import io
from typing import Iterator, Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from app.services.access_control_service import require_patient_access, log_phi_access
from app.persistence.models import Patient

logger = logging.getLogger(__name__)


# ALLOWLIST: Only these tables are safe to expose in the data console.
# Column names must match the actual schema (see
# app/persistence/models/patient.py — the patient DOB column is `dob`, not
# `date_of_birth`); listing the wrong name silently builds invalid SQL and
# 500s the CSV export.
SAFE_TABLES = {
    "patients": ["id", "first_name", "last_name", "dob", "created_at"],
    "patient_data_assets": ["id", "asset_type", "filename", "mime_type", "size_bytes", "created_at", "processing_status"],
    "ai_analysis_runs": ["id", "analysis_type", "model_name", "status", "created_at", "clinician_review_status"],
    "safety_flags": ["id", "flag_type", "severity", "message", "status", "created_at"],
    "audit_event_records": ["id", "action", "result", "created_at"],
    "consent_records": ["id", "consent_type", "status", "created_at"],
}

# PHI masking rules: field patterns that should be masked.
# Keep both `dob` (actual column) and `date_of_birth` (FHIR/CSV-import label
# used in the web frontend's import templates) so masking applies regardless
# of which name a caller surfaces.
PHI_PATTERNS = {
    "first_name": "***",
    "last_name": "***",
    "dob": "***-***-****",
    "date_of_birth": "***-***-****",
    "email": "***@***.***",
    "phone": "***-****",
    "ssn": "***-**-****",
    "address": "*** *** ***",
}


class DataConsoleAccessError(Exception):
    """Raised when data console access is denied."""
    pass


def get_available_sources(session: Session, actor_user_id: str) -> List[Dict[str, Any]]:
    """Get list of data sources available to the actor.
    
    Args:
        session: Database session
        actor_user_id: User requesting source list
        
    Returns:
        List of available tables with column info
        
    Raises:
        DataConsoleAccessError: If actor cannot access console
    """
    # Verify actor can use console (admin/clinician role check)
    from app.persistence.models import User
    
    actor = session.query(User).filter(User.id == actor_user_id).first()
    if not actor:
        raise DataConsoleAccessError(f"Actor {actor_user_id} not found")
    
    if actor.role not in ["clinician", "admin", "platform_admin"]:
        raise DataConsoleAccessError(f"Role {actor.role} cannot access data console")
    
    sources = []
    for table_name, columns in SAFE_TABLES.items():
        sources.append({
            "table": table_name,
            "columns": columns,
            "row_count_estimate": None,  # Would be populated by actual count if needed
        })
    
    return sources


def mask_phi_field(value: Any, field_name: str) -> Any:
    """Mask a potentially sensitive field.
    
    Args:
        value: Original field value
        field_name: Name of field
        
    Returns:
        Masked value if field is in PHI_PATTERNS, otherwise original value
    """
    if value is None:
        return None
    
    # Check for exact match first
    if field_name in PHI_PATTERNS:
        return PHI_PATTERNS[field_name]
    
    # Check for substring matches
    lower_field = field_name.lower()
    for pattern_field, mask_value in PHI_PATTERNS.items():
        if pattern_field in lower_field:
            return mask_value
    
    return value


def get_patient_rows(
    session: Session,
    actor_user_id: str,
    patient_id: str,
    table_name: str,
    limit: int = 100,
    offset: int = 0,
    mask_phi: bool = True,
) -> List[Dict[str, Any]]:
    """Fetch rows for a patient from a safe table.
    
    Args:
        session: Database session
        actor_user_id: User requesting rows
        patient_id: Patient to fetch data for
        table_name: Table name (must be in ALLOWLIST)
        limit: Max rows to return
        offset: Row offset for pagination
        mask_phi: If True, mask sensitive fields
        
    Returns:
        List of row dicts
        
    Raises:
        DataConsoleAccessError: If access denied or table not safe
    """
    # Access control checks
    require_patient_access(session, actor_user_id, patient_id)
    
    # Validate table name is in allowlist
    if table_name not in SAFE_TABLES:
        raise DataConsoleAccessError(f"Table '{table_name}' is not available in data console")
    
    allowed_columns = SAFE_TABLES[table_name]
    
    # Build safe query
    columns_str = ", ".join(allowed_columns)
    query_str = f"SELECT {columns_str} FROM {table_name} WHERE patient_id = :patient_id LIMIT :limit OFFSET :offset"
    
    try:
        result = session.execute(
            text(query_str),
            {"patient_id": patient_id, "limit": limit, "offset": offset},
        )
        rows = result.fetchall()
    except Exception as e:
        logger.error(f"Query failed: {e}")
        raise DataConsoleAccessError(f"Failed to fetch data: {str(e)}")
    
    # Convert to dicts and apply masking
    output = []
    for row in rows:
        row_dict = dict(row)
        
        if mask_phi:
            for field_name in row_dict.keys():
                row_dict[field_name] = mask_phi_field(row_dict[field_name], field_name)
        
        output.append(row_dict)
    
    # Log access
    log_phi_access(
        session=session,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
        action="data_console_read",
        resource_type=table_name,
    )
    
    return output


def get_patient_data_summary(
    session: Session, actor_user_id: str, patient_id: str
) -> Dict[str, Any]:
    """Get a summary of all data available for a patient in the console.
    
    Args:
        session: Database session
        actor_user_id: User requesting summary
        patient_id: Patient ID
        
    Returns:
        Dict with data counts by table
        
    Raises:
        DataConsoleAccessError: If access denied
    """
    # Access control
    require_patient_access(session, actor_user_id, patient_id)
    
    summary = {}
    
    # Count rows in each table for this patient
    for table_name in SAFE_TABLES.keys():
        try:
            query_str = f"SELECT COUNT(*) as cnt FROM {table_name} WHERE patient_id = :patient_id"
            result = session.execute(text(query_str), {"patient_id": patient_id})
            row = result.fetchone()
            count = row[0] if row else 0
            summary[table_name] = count
        except Exception as e:
            logger.warning(f"Could not count {table_name}: {e}")
            summary[table_name] = None
    
    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Clinic-scoped aggregates and bulk export (Slice A of the Data Console).
# ─────────────────────────────────────────────────────────────────────────────
#
# Some SAFE_TABLES carry a denormalised ``clinic_id`` column (e.g.
# ``ai_analysis_runs``, ``patient_data_assets``, ``safety_flags``). Others
# (``patients``, ``consent_records``, ``audit_event_records``) do NOT — for
# those we join through ``patients.clinician_id`` → ``users.clinic_id`` to
# scope the result set to the requested clinic. The mapping below makes that
# decision explicit per-table; it is the ONLY place that knows how a row is
# attributed to a clinic, so the router never has to interpolate table names
# or build joins.
#
# IMPORTANT: ``table_name`` MUST be validated against SAFE_TABLES before the
# value is ever interpolated into a SQL string (see ``_safe_table_query``).

# Logical table name → actual SQL table name. For most rows these match, but
# ``audit_event_records`` is the legacy doc-name for the live ``audit_events``
# table. Mapping the alias here keeps SAFE_TABLES stable while routing the
# real SQL at this layer.
_TABLE_NAME_TO_SQL_TABLE: Dict[str, str] = {
    "patients": "patients",
    "patient_data_assets": "patient_data_assets",
    "ai_analysis_runs": "ai_analysis_runs",
    "safety_flags": "safety_flags",
    "audit_event_records": "audit_events",
    "consent_records": "consent_records",
}

# Tables that carry ``clinic_id`` directly — a simple WHERE clause suffices.
_TABLES_WITH_DIRECT_CLINIC_ID = frozenset(
    {
        "patient_data_assets",
        "ai_analysis_runs",
        "safety_flags",
    }
)


def _safe_columns(table_name: str) -> List[str]:
    """Return the SAFE_TABLES allowlist columns for ``table_name``.

    The router validates ``table_name`` against ``SAFE_TABLES`` before we
    get here, but we re-check defensively — never trust a caller's string.
    """
    if table_name not in SAFE_TABLES:
        raise DataConsoleAccessError(
            f"Table '{table_name}' is not available in data console"
        )
    return list(SAFE_TABLES[table_name])


def _safe_table_query(
    table_name: str,
    *,
    select_columns: List[str] | str,
    extra_where: str = "",
) -> str:
    """Build a SELECT against ``table_name`` with the right clinic-scope JOIN.

    ``table_name`` MUST already be in ``SAFE_TABLES`` (verified via
    ``_safe_columns``). The clinic_id is always bound as the ``:clinic_id``
    parameter — never inlined.

    For tables without a direct ``clinic_id`` column we resolve clinic via
    the patient's clinician row:
        patient_id → patients.clinician_id → users.clinic_id

    The ``patients`` table itself is joined directly to ``users``.

    Returns the SQL string. Caller is responsible for executing with
    ``{"clinic_id": <uuid>}``.
    """
    if table_name not in SAFE_TABLES:
        raise DataConsoleAccessError(
            f"Table '{table_name}' is not available in data console"
        )

    sql_table = _TABLE_NAME_TO_SQL_TABLE[table_name]

    # When select_columns is a list, prefix it with the row alias so JOINs
    # don't collide on column names (e.g. ``id`` exists in many tables).
    if isinstance(select_columns, list):
        cols_sql = ", ".join(f"t.{c}" for c in select_columns)
    else:
        cols_sql = select_columns  # caller passed "COUNT(*) as cnt" etc.

    where_extra = f" AND {extra_where}" if extra_where else ""

    if table_name in _TABLES_WITH_DIRECT_CLINIC_ID:
        return (
            f"SELECT {cols_sql} FROM {sql_table} AS t "
            f"WHERE t.clinic_id = :clinic_id{where_extra}"
        )

    if table_name == "patients":
        # patients → users.clinic_id via clinician_id
        return (
            f"SELECT {cols_sql} FROM {sql_table} AS t "
            f"JOIN users AS u ON u.id = t.clinician_id "
            f"WHERE u.clinic_id = :clinic_id{where_extra}"
        )

    if table_name in ("consent_records", "audit_event_records"):
        # consent_records.patient_id → patients.clinician_id → users.clinic_id.
        # audit_events does not carry patient_id directly; it carries
        # ``target_id`` (which is the patient_id when target_type='patient').
        # For the aggregate view we count audit_events where target_id matches
        # any patient in the clinic.
        if table_name == "audit_event_records":
            return (
                f"SELECT {cols_sql} FROM {sql_table} AS t "
                f"JOIN patients AS p ON p.id = t.target_id "
                f"JOIN users AS u ON u.id = p.clinician_id "
                f"WHERE u.clinic_id = :clinic_id{where_extra}"
            )
        return (
            f"SELECT {cols_sql} FROM {sql_table} AS t "
            f"JOIN patients AS p ON p.id = t.patient_id "
            f"JOIN users AS u ON u.id = p.clinician_id "
            f"WHERE u.clinic_id = :clinic_id{where_extra}"
        )

    raise DataConsoleAccessError(
        f"Table '{table_name}' has no clinic-scope strategy"
    )


def get_clinic_table_summary(session: Session, clinic_id: str) -> Dict[str, int]:
    """Return ``{table_name: row_count}`` for every SAFE_TABLES table,
    scoped to a single clinic.

    Tables that fail to count (e.g. missing in this deployment) report ``0``
    rather than raising — the console is read-only and should degrade
    gracefully. Errors are logged at WARNING.

    Args:
        session: SQLAlchemy session.
        clinic_id: Clinic UUID to scope by.

    Returns:
        Dict mapping each SAFE_TABLES table_name to its row count for the
        clinic. Always returns one entry per SAFE_TABLES key.
    """
    summary: Dict[str, int] = {}
    for table_name in SAFE_TABLES.keys():
        try:
            query_str = _safe_table_query(
                table_name, select_columns="COUNT(*) as cnt"
            )
            result = session.execute(text(query_str), {"clinic_id": clinic_id})
            row = result.fetchone()
            summary[table_name] = int(row[0]) if row and row[0] is not None else 0
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning(
                "clinic-summary count failed for table=%s clinic=%s: %s",
                table_name,
                clinic_id,
                exc,
            )
            summary[table_name] = 0
    return summary


def stream_clinic_table_csv(
    session: Session,
    clinic_id: str,
    table_name: str,
) -> Iterator[bytes]:
    """Stream a clinic-scoped CSV of one SAFE_TABLES table, row by row.

    PHI is **NOT** masked in this export. The intended caller is a clinic
    owner downloading their own clinic's data — the per-patient endpoints
    mask, but this bulk export does not. Cross-clinic access is prevented
    by the router (require_clinic_access + clinic ownership check) and
    re-enforced here by the WHERE clause built from ``_safe_table_query``.

    Args:
        session: SQLAlchemy session.
        clinic_id: Clinic UUID to scope rows to.
        table_name: Must be in ``SAFE_TABLES``. Validated again here.

    Yields:
        UTF-8 encoded ``bytes`` — header row first, then one row per record.

    Raises:
        DataConsoleAccessError: If ``table_name`` is not allowlisted.
    """
    if table_name not in SAFE_TABLES:
        raise DataConsoleAccessError(
            f"Table '{table_name}' is not available in data console"
        )

    columns = _safe_columns(table_name)
    query_str = _safe_table_query(table_name, select_columns=columns)

    # Header line first — emit before opening the cursor so the client sees
    # bytes immediately even if the result set is large.
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    yield buf.getvalue().encode("utf-8")

    # ``stream_results=True`` would be ideal here but SQLite (used in tests
    # and many dev installs) ignores it. The .yield_per loop keeps memory
    # bounded on Postgres without breaking SQLite — fetchmany() is safe on
    # all SQLAlchemy dialects.
    result = session.execute(text(query_str), {"clinic_id": clinic_id})
    BATCH = 500
    while True:
        chunk = result.fetchmany(BATCH)
        if not chunk:
            break
        for row in chunk:
            buf = io.StringIO()
            writer = csv.writer(buf)
            # Coerce None → '' so CSV cells stay parseable.
            writer.writerow(["" if v is None else v for v in row])
            yield buf.getvalue().encode("utf-8")


def validate_console_query_safety(query: str) -> bool:
    """Validate that a query string is safe (prevent SQL injection).
    
    Basic checks: no INSERT, UPDATE, DELETE, DROP, UNION, etc.
    
    Args:
        query: SQL query string to validate
        
    Returns:
        True if query appears safe, False otherwise
    """
    dangerous_keywords = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
        "TRUNCATE", "CREATE", "GRANT", "REVOKE", "UNION",
        "EXEC", "EXECUTE", "--", "/*", "*/",
    ]
    
    upper_query = query.upper()
    for keyword in dangerous_keywords:
        if keyword in upper_query:
            return False
    
    return True
