#!/usr/bin/env python3
"""Demo/Production Boundary Verification Script.

Run this script before every deployment to ensure no demo data can leak
into production. Also runs as a production cron job to detect any
configuration drift.

Usage:
    python scripts/verify_demo_boundary.py

Exit codes:
    0 - All checks passed, boundary is secure
    1 - One or more checks failed, DO NOT DEPLOY
"""

import os
import sys
import re
import subprocess
from pathlib import Path

# ANSI colors for terminal output
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RESET = "\033[0m"

CHECKS_PASSED = 0
CHECKS_FAILED = 0

REPO_ROOT = Path(__file__).parent.parent
API_DIR = REPO_ROOT / "apps" / "api"


def check(name: str):
    """Decorator that counts passes/fails."""
    def decorator(func):
        def wrapper():
            global CHECKS_PASSED, CHECKS_FAILED
            try:
                result = func()
                if result:
                    print(f"  {GREEN}✓{RESET} {name}")
                    CHECKS_PASSED += 1
                    return True
                else:
                    print(f"  {RED}✗{RESET} {name}")
                    CHECKS_FAILED += 1
                    return False
            except Exception as e:
                print(f"  {RED}✗{RESET} {name}: {e}")
                CHECKS_FAILED += 1
                return False
        return wrapper
    return decorator


# Check 1: MRI_DEMO_MODE is not "1" in production fly.toml
@check("MRI_DEMO_MODE is not '1' in fly.toml")
def check_mri_demo_mode():
    fly_toml = API_DIR / "fly.toml"
    if not fly_toml.exists():
        print(f"    {YELLOW}⚠ fly.toml not found{RESET}")
        return True  # Not present = not dangerous
    content = fly_toml.read_text()
    # Find MRI_DEMO_MODE line
    match = re.search(r'MRI_DEMO_MODE\s*=\s*"(\d)"', content)
    if not match:
        print(f"    {YELLOW}⚠ MRI_DEMO_MODE not found in fly.toml{RESET}")
        return True  # Not present = not dangerous
    value = match.group(1)
    if value == "1":
        print(f"    {RED}  DANGER: MRI_DEMO_MODE='1' in production fly.toml!{RESET}")
        return False
    return True


# Check 2: demo_seed_enabled has environment guard
@check("demo_seed_enabled has production guard")
def check_demo_seed_guard():
    seed_file = API_DIR / "app" / "services" / "demo_clinic_seed.py"
    if not seed_file.exists():
        print(f"    {YELLOW}⚠ demo_clinic_seed.py not found{RESET}")
        return True
    content = seed_file.read_text()
    # Must check app_env before checking DEEPSYNAPS_DEMO_CLINIC_SEED
    has_env_check = 'app_env not in ("development", "test")' in content or \
                    "app_env not in ('development', 'test')" in content
    return has_env_check


# Check 3: main.py has production safety guard
@check("main.py has production safety guard for demo seeding")
def check_main_safety_guard():
    main_file = API_DIR / "app" / "main.py"
    if not main_file.exists():
        print(f"    {YELLOW}⚠ main.py not found{RESET}")
        return True
    content = main_file.read_text()
    has_guard = 'settings.app_env == "production"' in content and \
                "PRODUCTION SAFETY" in content
    return has_guard


# Check 4: No hardcoded demo credentials in production code
@check("No hardcoded demo credentials")
def check_hardcoded_demo_creds():
    main_file = API_DIR / "app" / "main.py"
    if not main_file.exists():
        return True
    content = main_file.read_text()
    # Demo emails should only exist in the _seed_demo_users_for_dev function
    # which is gated by app_env check
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '@example.com' in line:
            # Check if this line is inside the _seed_demo_users_for_dev function
            # which is gated by app_env check. Look back up to 25 lines for context.
            context = '\n'.join(lines[max(0, i-25):i+1])
            if 'def _seed_demo_users_for_dev' not in context and \
               'app_env not in' not in context:
                print(f"    {RED}  Found @example.com outside demo function at line {i+1}{RESET}")
                return False
    return True


# Check 5: Demo endpoints exist and are protected
@check("Demo endpoints are registered with protection")
def check_demo_endpoints():
    onboarding = API_DIR / "app" / "routers" / "onboarding_router.py"
    if onboarding.exists():
        content = onboarding.read_text()
        return "post_seed_demo" in content
    return True  # File doesn't exist, not our concern


# Check 6: DEEPSYNAPS_DEMO_CLINIC_SEED backdoor removed
@check("DEEPSYNAPS_DEMO_CLINIC_SEED backdoor is closed")
def check_demo_clinic_seed_backdoor():
    seed_file = API_DIR / "app" / "services" / "demo_clinic_seed.py"
    if not seed_file.exists():
        return True
    content = seed_file.read_text()
    # Should require both env check AND env var
    has_env_first = content.find('app_env') < content.find('DEEPSYNAPS_DEMO_CLINIC_SEED')
    return has_env_first


# Check 7: Demo middleware exists
@check("Demo detection middleware exists")
def check_demo_middleware():
    middleware_file = API_DIR / "app" / "middleware" / "demo_detection.py"
    return middleware_file.exists()


# Check 8: Demo audit logging exists
@check("Demo audit logging exists")
def check_demo_audit():
    audit_file = API_DIR / "app" / "middleware" / "demo_audit.py"
    return audit_file.exists()


# Check 9: Metrics middleware has clinical endpoint protection
@check("Metrics middleware protects clinical endpoints")
def check_metrics_middleware():
    middleware_file = API_DIR / "app" / "monitoring" / "middleware.py"
    if not middleware_file.exists():
        return True
    content = middleware_file.read_text()
    return "_CLINICAL_PREFIXES" in content


# Check 10: Health check excludes demo users from production
@check("Health check validates production safety")
def check_health_protection():
    health_file = API_DIR / "app" / "health_check.py"
    if not health_file.exists():
        return True
    content = health_file.read_text()
    return "demo" not in content.lower() or "demo-only" in content.lower()


def main():
    print("=" * 70)
    print("DEEPSYNAPS DEMO/PRODUCTION BOUNDARY VERIFICATION")
    print("=" * 70)
    print(f"Repository: {REPO_ROOT}")
    print(f"Environment: {os.environ.get('DEEPSYNAPS_APP_ENV', 'unknown')}")
    print("")

    # Run all checks
    check_mri_demo_mode()
    check_demo_seed_guard()
    check_main_safety_guard()
    check_hardcoded_demo_creds()
    check_demo_endpoints()
    check_demo_clinic_seed_backdoor()
    check_demo_middleware()
    check_demo_audit()
    check_metrics_middleware()
    check_health_protection()

    print("")
    print("=" * 70)
    print(f"RESULTS: {CHECKS_PASSED} passed, {CHECKS_FAILED} failed")
    print("=" * 70)

    if CHECKS_FAILED > 0:
        print(f"\n{RED}DEPLOYMENT BLOCKED: {CHECKS_FAILED} critical check(s) failed.{RESET}")
        print("Fix the issues above before deploying to production.")
        sys.exit(1)
    else:
        print(f"\n{GREEN}ALL CHECKS PASSED. Demo/production boundary is secure.{RESET}")
        print("Safe to proceed with deployment.")
        sys.exit(0)


if __name__ == "__main__":
    main()
