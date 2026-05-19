"""PubMed Central (PMC) adapter — catalogued only.

The existing PubMed adapter already resolves PMCIDs via NCBI E-utilities,
so a dedicated PMC adapter is not strictly required for citation lookup.
This adapter is catalogued so the Cat3 registry exposes PMC explicitly
and a future Slice B implementation can split full-text OA fetch into
its own surface.
"""

from __future__ import annotations

from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
    CataloguedSourceMetadata,
)


class PubMedCentralAdapter(CataloguedOnlyAdapter):
    catalogue_metadata = CataloguedSourceMetadata(
        display_name="PubMed Central (PMC)",
        version_tag="ncbi-eutils-2026",
        endpoint_url="https://www.ncbi.nlm.nih.gov/pmc/tools/oa-service/",
        license_type="NCBI-terms",
        license_url="https://www.ncbi.nlm.nih.gov/home/about/policies/",
        attribution_text="Data from PubMed Central, U.S. National Library of Medicine.",
        allows_research=True,
        allows_commercial=False,
        requires_attribution=True,
        catalogue_reason=(
            "PMC full-text OA service is not wired as a dedicated adapter; "
            "PMCID resolution is currently handled inside the PubMed adapter."
        ),
    )
