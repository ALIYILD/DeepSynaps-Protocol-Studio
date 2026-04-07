from dataclasses import dataclass

from deepsynaps_core_schema import UserRole


@dataclass(frozen=True, slots=True)
class DemoActor:
    actor_id: str
    display_name: str
    role: UserRole
    package_id: str


# ── Demo token registry ───────────────────────────────────────────────────────
# Each token maps to a role + package pair.
# Legacy tokens are backward compatible; package assignments match historical defaults.

DEMO_ACTOR_TOKENS: dict[str, DemoActor] = {
    # Legacy tokens
    "guest-demo-token": DemoActor(
        actor_id="actor-guest-demo",
        display_name="Guest Demo User",
        role="guest",
        package_id="explorer",
    ),
    "clinician-demo-token": DemoActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",
        package_id="clinician_pro",
    ),
    "admin-demo-token": DemoActor(
        actor_id="actor-admin-demo",
        display_name="Admin Demo User",
        role="admin",
        package_id="enterprise",
    ),
    # Package-specific demo tokens
    "explorer-demo-token": DemoActor(
        actor_id="actor-explorer-demo",
        display_name="Explorer Demo",
        role="guest",
        package_id="explorer",
    ),
    "resident-demo-token": DemoActor(
        actor_id="actor-resident-demo",
        display_name="Resident / Fellow Demo",
        role="clinician",
        package_id="resident",
    ),
    "clinic-admin-demo-token": DemoActor(
        actor_id="actor-clinic-admin-demo",
        display_name="Clinic Admin Demo",
        role="admin",
        package_id="clinic_team",
    ),
    "enterprise-demo-token": DemoActor(
        actor_id="actor-enterprise-demo",
        display_name="Enterprise Demo",
        role="admin",
        package_id="enterprise",
    ),
}

ANONYMOUS_ACTOR = DemoActor(
    actor_id="actor-anonymous",
    display_name="Anonymous Viewer",
    role="guest",
    package_id="explorer",
)
