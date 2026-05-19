"""Epistemonikos adapter — catalogued only."""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class EpistemonikosAdapter(CataloguedOnlyAdapter):
    catalogue_metadata = CataloguedSourceMetadata(
        display_name="Epistemonikos",
        version_tag="public-2026",
        endpoint_url="https://www.epistemonikos.org/",
        license_type="CC-BY-NC-4.0",
        license_url="https://creativecommons.org/licenses/by-nc/4.0/",
        attribution_text="Data from Epistemonikos Foundation.",
        allows_research=True,
        allows_commercial=False,
        requires_attribution=True,
        catalogue_reason=(
            "A prototype Epistemonikos adapter exists at "
            "app.knowledge.epistemonikos_adapter but is not exposed through "
            "the production registry path; live wiring is deferred to Slice B."
        ),
    )
