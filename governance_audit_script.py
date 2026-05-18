import os
import re
from pathlib import Path

routers_dir = Path("apps/api/app/routers")
findings = []

# Pattern matchers
consent_gates = [
    "require_ai_analysis_consent",
    "require_document_generation_consent", 
    "require_device_sync_consent",
    "require_recording_consent",
    "_assert_recording_consent"
]

# Check each router
for router_file in sorted(routers_dir.glob("*.py")):
    if router_file.name == "__init__.py":
        continue
    
    content = router_file.read_text()
    
    # Check if it handles patient data
    has_patient_id = "patient_id" in content
    has_post_endpoint = "@router.post" in content or "def create" in content
    has_put_patch = "@router.put" in content or "@router.patch" in content
    
    # Check for consent gates
    has_consent_gate = any(gate in content for gate in consent_gates)
    
    # Check for role enforcement
    has_role_check = "require_minimum_role" in content
    
    # Check for audit logging
    has_audit_log = "_audit_log" in content or "create_audit_event" in content or "AuditEventRecord" in content
    
    if has_patient_id and (has_post_endpoint or has_put_patch):
        findings.append({
            'file': router_file.name,
            'patient_data': True,
            'has_consent_gate': has_consent_gate,
            'has_role_check': has_role_check,
            'has_audit_log': has_audit_log,
        })

print("GOVERNANCE AUDIT FINDINGS")
print("=" * 80)
for f in findings:
    consent_status = "✓" if f['has_consent_gate'] else "✗ MISSING"
    role_status = "✓" if f['has_role_check'] else "✗ MISSING"
    audit_status = "✓" if f['has_audit_log'] else "✗ MISSING"
    print(f"\n{f['file']:<50}")
    print(f"  Consent Gate:  {consent_status}")
    print(f"  Role Check:    {role_status}")
    print(f"  Audit Log:     {audit_status}")
    
    if not f['has_consent_gate'] and f['patient_data']:
        print(f"  ⚠ VULNERABILITY: Handles patient_id without consent enforcement")
    if not f['has_role_check']:
        print(f"  ⚠ RISK: No minimum role enforcement")

