"""Safe read-only data console service.

Provides masked, allowlist-gated access to patient data for clinician review:
- Data source discovery (available tables)
- Row fetching with PHI masking
- Safety validation (no raw SQL, no cross-clinic access)
- Audit logging of all access
"""
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

from app.services.access_control_service import require_patient_access, log_phi_access
from app.persistence.models import Patient

logger = logging.getLogger(__name__)


# ALLOWLIST: Only these tables are safe to expose in the data console
SAFE_TABLES = {
    "patients": ["id", "first_name", "last_name", "date_of_birth", "created_at"],
    "patient_data_assets": ["id", "asset_type", "filename", "mime_type", "size_bytes", "created_at", "processing_status"],
    "ai_analysis_runs": ["id", "analysis_type", "model_name", "status", "created_at", "clinician_review_status"],
    "safety_flags": ["id", "flag_type", "severity", "message", "status", "created_at"],
    "audit_event_records": ["id", "action", "result", "created_at"],
    "consent_records": ["id", "consent_type", "status", "created_at"],
}

# PHI masking rules: field patterns that should be masked
PHI_PATTERNS = {
    "first_name": "***",
    "last_name": "***",
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
