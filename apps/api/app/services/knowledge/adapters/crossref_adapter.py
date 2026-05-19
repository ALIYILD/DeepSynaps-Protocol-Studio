"""CrossRef adapter — catalogued only.

CrossRef's REST API at ``api.crossref.org`` is free and well-documented.
A live implementation is straightforward but is intentionally deferred to
Slice B so this PR can stay focused on registry/lifecycle.
"""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class CrossRefAdapter(CataloguedOnlyAdapter):
    catalogue_metadata = CataloguedSourceMetadata(
        display_name="CrossRef",
        version_tag="rest-api-v1",
        endpoint_url="https://api.crossref.org/",
        license_type="CrossRef-public-data",
        license_url="https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-metadata-license-information/",
        attribution_text="Data from CrossRef.",
        allows_research=True,
        allows_commercial=True,
        requires_attribution=True,
        catalogue_reason=(
            "CrossRef REST is free and reachable but the live adapter is "
            "scheduled for Slice B; until then it is exposed as catalogued."
        ),
    )
