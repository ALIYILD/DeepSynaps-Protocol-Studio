"""Trip Database adapter — catalogued only.

Trip Database (``tripdatabase.com``) offers a search-engine surface for
evidence synthesis. A prototype lives at
``apps/api/app/knowledge/trip_database_adapter.py`` but is not registered
through the production registry path. Catalogued here so Cat3 surfaces
the source explicitly.
"""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class TripDatabaseAdapter(CataloguedOnlyAdapter):
    catalogue_metadata = CataloguedSourceMetadata(
        display_name="Trip Database",
        version_tag="public-2026",
        endpoint_url="https://www.tripdatabase.com/",
        license_type="Trip-terms",
        license_url="https://www.tripdatabase.com/about/terms",
        attribution_text="Data from Trip Database.",
        allows_research=True,
        allows_commercial=False,
        requires_attribution=True,
        catalogue_reason=(
            "A prototype Trip Database adapter exists at "
            "app.knowledge.trip_database_adapter but is not exposed "
            "through the production registry path; live wiring is "
            "deferred to Slice B."
        ),
        required_credential_env_vars=("DEEPSYNAPS_TRIP_API_KEY",),
    )
