"""ACP Journal Club adapter — catalogued only, subscription-gated.

The ACP Journal Club is a curated evidence summary surface from the
American College of Physicians. It is a paid subscription product; this
adapter therefore reports ``status="disabled"`` unless the required
credential env var is set. No live transport is wired in this build.
"""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class ACPJournalClubAdapter(CataloguedOnlyAdapter):
    catalogue_metadata = CataloguedSourceMetadata(
        display_name="ACP Journal Club",
        version_tag="subscription-2026",
        endpoint_url="https://www.acpjournals.org/journal/aim",
        license_type="ACP-subscription",
        license_url="https://www.acpjournals.org/journal/aim/about",
        attribution_text="Data from ACP Journal Club (subscription).",
        allows_research=False,
        allows_commercial=False,
        requires_attribution=True,
        catalogue_reason=(
            "ACP Journal Club is a subscription product; no public API is "
            "available and no credentials are configured in this build."
        ),
        required_credential_env_vars=(
            "DEEPSYNAPS_ACP_USERNAME",
            "DEEPSYNAPS_ACP_PASSWORD",
        ),
    )
