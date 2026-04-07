from dataclasses import dataclass

from deepsynaps_core_schema import UserRole


@dataclass(frozen=True, slots=True)
class DemoActor:
    actor_id: str
    display_name: str
    role: UserRole


DEMO_ACTOR_TOKENS: dict[str, DemoActor] = {
    "guest-demo-token": DemoActor(
        actor_id="actor-guest-demo",
        display_name="Guest Demo User",
        role="guest",
    ),
    "clinician-demo-token": DemoActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",
    ),
    "admin-demo-token": DemoActor(
        actor_id="actor-admin-demo",
        display_name="Admin Demo User",
        role="admin",
    ),
}

ANONYMOUS_ACTOR = DemoActor(
    actor_id="actor-anonymous",
    display_name="Anonymous Viewer",
    role="guest",
)
