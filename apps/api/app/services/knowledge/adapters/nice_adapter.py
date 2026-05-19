"""NICE guidelines adapter — catalogued only.

NICE publishes guidance at ``nice.org.uk`` and exposes structured XML
feeds for individual guidelines, but not a unified search API. A live
adapter exists at ``apps/api/app/knowledge/nice_adapter.py`` but is not
yet wired through the canonical
``app.services.knowledge.adapters.*`` interface used by the production
registry. Catalogued here so the Cat3 status surface is complete.
"""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class NICEAdapter(CataloguedOnlyAdapter):
    catalogue_metadata = CataloguedSourceMetadata(
        display_name="NICE Guidelines",
        version_tag="public-2026",
        endpoint_url="https://www.nice.org.uk/guidance",
        license_type="OGL-v3.0",
        license_url="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        attribution_text="Data adapted from NICE under the Open Government Licence v3.0.",
        allows_research=True,
        allows_commercial=True,
        requires_attribution=True,
        catalogue_reason=(
            "A prototype NICE adapter exists at app.knowledge.nice_adapter but "
            "is not exposed through the production registry path; Slice B will "
            "promote it to a fully wired adapter."
        ),
    )
