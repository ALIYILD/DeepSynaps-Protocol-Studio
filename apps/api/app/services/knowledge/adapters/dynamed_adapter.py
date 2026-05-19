"""DynaMed adapter — catalogued only, subscription-gated."""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class DynaMedAdapter(CataloguedOnlyAdapter):
    catalogue_metadata = CataloguedSourceMetadata(
        display_name="DynaMed",
        version_tag="subscription-2026",
        endpoint_url="https://www.dynamed.com/",
        license_type="EBSCO-subscription",
        license_url="https://www.dynamed.com/home/terms-and-conditions",
        attribution_text="Data from DynaMed (EBSCO subscription).",
        allows_research=False,
        allows_commercial=False,
        requires_attribution=True,
        catalogue_reason=(
            "DynaMed is a subscription product; no public API is available "
            "and no credentials are configured in this build."
        ),
        required_credential_env_vars=("DEEPSYNAPS_DYNAMED_API_KEY",),
    )
