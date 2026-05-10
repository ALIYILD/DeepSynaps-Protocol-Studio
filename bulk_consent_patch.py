#!/usr/bin/env python3
"""
Bulk consent enforcement patch for all remaining routers.
Applies consistent consent checks across Items B-C routers.
"""

import re
from pathlib import Path

ROUTERS_CONFIG = {
    # Item B: Device Sync Routers
    'apps/api/app/routers/device_sync_router.py': {
        'consent_type': 'require_device_sync_consent',
        'device_type': 'wearable',
        'endpoints': ['/sync', '/ingest'],
    },
    'apps/api/app/routers/home_devices_router.py': {
        'consent_type': 'require_device_sync_consent',
        'device_type': 'clinical',
        'endpoints': ['/connect', '/ingest'],
    },
    'apps/api/app/routers/home_device_portal_router.py': {
        'consent_type': 'require_device_sync_consent',
        'device_type': 'portal',
        'endpoints': ['/ingest'],
    },
    # Item C: Document Generation Routers
    'apps/api/app/routers/protocols_generate_router.py': {
        'consent_type': 'require_document_generation_consent',
        'document_type': 'protocol',
        'endpoints': ['/generate'],
    },
    'apps/api/app/routers/documents_router.py': {
        'consent_type': 'require_document_generation_consent',
        'document_type': 'document',
        'endpoints': ['/generate', '/export'],
    },
    'apps/api/app/routers/protocols_saved_router.py': {
        'consent_type': 'require_document_generation_consent',
        'document_type': 'protocol',
        'endpoints': ['/export'],
    },
    'apps/api/app/routers/protocol_studio_router.py': {
        'consent_type': 'require_document_generation_consent',
        'document_type': 'protocol',
        'endpoints': ['/generate'],
    },
}

def add_consent_imports(content):
    """Add required imports if not already present."""
    
    # Add status to fastapi imports
    if 'from fastapi import' in content and 'status' not in content:
        content = re.sub(
            r'from fastapi import ([^\n]+)',
            lambda m: f"from fastapi import {m.group(1).rstrip(')')} , status)" if ')' in m.group(1) else f"from fastapi import {m.group(1)}, status",
            content,
            count=1
        )
    
    # Add consent imports
    if 'from app.services.consent_enforcement import' not in content:
        # Find app.database import and add after
        if 'from app.database import' in content:
            content = re.sub(
                r'(from app\.database import [^\n]+)',
                r'\1\nfrom app.services.consent_enforcement import (\n    require_ai_analysis_consent,\n    require_device_sync_consent,\n    require_document_generation_consent,\n    ConsentMissingError,\n)',
                content,
                count=1
            )
    
    # Add HTTPException if not there
    if 'HTTPException' not in content:
        content = re.sub(
            r'(from fastapi import [^;]+)',
            lambda m: m.group(1).replace(')', ', HTTPException)') if ')' not in m.group(1) or 'HTTPException' not in m.group(1) else m.group(1),
            content,
            count=1
        )
    
    return content

def process_router(filepath, config):
    """Process a single router file."""
    path = Path(filepath)
    if not path.exists():
        return False, f"File not found: {filepath}"
    
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        # Add imports
        content = add_consent_imports(content)
        
        # For device sync routers, add checks before session ingestion
        if 'require_device_sync_consent' in config['consent_type']:
            # Find POST endpoints that ingest patient data
            for endpoint in config['endpoints']:
                pattern = rf'@router\.post\("{re.escape(endpoint)}"[^)]*\)(\s*(?:async )?\w+def [^(]*\([^)]*patient[^)]*\)[^:]*:)'
                if re.search(pattern, content):
                    # Add consent check after function signature and docstring
                    def add_check(match):
                        func_sig = match.group(1)
                        # Find the end of docstring if present
                        remaining = content[match.end():]
                        docstring_match = re.match(r'\s*"""[\s\S]*?"""', remaining)
                        
                        check = f'''    # CONSENT ENFORCEMENT: device_sync
    try:
        require_device_sync_consent(
            session=db,
            patient_id=patient_id,
            clinic_id=actor.clinic_id,
            actor_user_id=actor.user_id,
            device_type="{config['device_type']}",
        )
    except ConsentMissingError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient consent required for device sync.",
        )
'''
                        return match.group(0) + '\n' + check
                    
                    content = re.sub(pattern, add_check, content)
        
        # For document generation routers
        elif 'require_document_generation_consent' in config['consent_type']:
            for endpoint in config['endpoints']:
                pattern = rf'@router\.post\("{re.escape(endpoint)}"[^)]*\)(\s*(?:async )?\w+def [^(]*\([^)]*patient[^)]*\)[^:]*:)'
                if re.search(pattern, content):
                    def add_check(match):
                        check = f'''    # CONSENT ENFORCEMENT: document_generation
    try:
        require_document_generation_consent(
            session=db,
            patient_id=patient_id,
            clinic_id=actor.clinic_id,
            actor_user_id=actor.user_id,
            document_type="{config.get('document_type', 'document')}",
        )
    except ConsentMissingError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient consent required for document generation.",
        )
'''
                        return match.group(0) + '\n' + check
                    
                    content = re.sub(pattern, add_check, content)
        
        with open(filepath, 'w') as f:
            f.write(content)
        
        return True, f"Updated: {path.name}"
    except Exception as e:
        return False, f"Error processing {filepath}: {str(e)}"

def main():
    print("\n" + "="*80)
    print("BULK CONSENT ENFORCEMENT PATCH - REMAINING 6 ROUTERS")
    print("="*80 + "\n")
    
    results = []
    for filepath, config in ROUTERS_CONFIG.items():
        success, msg = process_router(filepath, config)
        status_icon = "✅" if success else "❌"
        results.append(f"{status_icon} {msg}")
        print(f"{status_icon} {msg}")
    
    print("\n" + "="*80)
    successful = sum(1 for r in results if r.startswith("✅"))
    print(f"RESULTS: {successful}/{len(ROUTERS_CONFIG)} routers patched")
    print("="*80 + "\n")
    
    return successful == len(ROUTERS_CONFIG)

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
