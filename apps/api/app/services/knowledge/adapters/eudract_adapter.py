"""EU Clinical Trials Register (EudraCT) adapter — catalogued only."""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class EudraCTAdapter(CataloguedOnlyAdapter):
    """EU Clinical Trials Register / EudraCT.

    The public register at ``clinicaltrialsregister.eu`` does not publish
    a programmatic JSON API. Bulk EudraCT records are accessible via the
    EMA's Open Data download portal (CSV) but not as live query endpoints,
    so we represent EudraCT as catalogued rather than HEALTHY.
    """

    catalogue_metadata = CataloguedSourceMetadata(
        display_name="EU Clinical Trials Register (EudraCT)",
        version_tag="public-register-2026",
        endpoint_url="https://www.clinicaltrialsregister.eu/",
        license_type="EU-public-domain",
        license_url="https://www.clinicaltrialsregister.eu/disclaimer.html",
        attribution_text="Data from the EU Clinical Trials Register.",
        allows_research=True,
        allows_commercial=False,
        requires_attribution=True,
        catalogue_reason=(
            "EudraCT does not expose a stable programmatic search API; "
            "bulk extracts are available via the EMA open-data portal but "
            "are not wired in this build."
        ),
    )
