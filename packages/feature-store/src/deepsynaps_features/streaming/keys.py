from __future__ import annotations


def redis_key(tenant_id: str, patient_id: str, group: str) -> str:
    # Tenant isolation is enforced via the key namespace.
    return f"tenant:{tenant_id}:patient:{patient_id}:fg:{group}"

