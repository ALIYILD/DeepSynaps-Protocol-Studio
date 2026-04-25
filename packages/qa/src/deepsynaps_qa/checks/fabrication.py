"""Fabrication detection checks (STUBBED — no PubMed API calls yet).

This module extracts PMIDs and DOIs via regex but does not call external APIs.
It returns INFO-level findings indicating the check is pending full integration.
"""

from __future__ import annotations

import re

from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec

PMID_RE = re.compile(r"\b(\d{7,8})\b")
DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"'<>]+)", re.IGNORECASE)


@CheckRegistry.register
class FabricationCheck(BaseCheck):
    """Cross-check citations against PubMed (stubbed)."""

    category = "fabrication"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []

        # Extract identifiers for future validation
        full_text = artifact.content
        for cit in artifact.citations:
            full_text += " " + str(cit.get("pmid", ""))
            full_text += " " + str(cit.get("doi", ""))
            full_text += " " + str(cit.get("title", ""))

        pmids = PMID_RE.findall(full_text)
        dois = DOI_RE.findall(full_text)

        identifier_count = len(set(pmids)) + len(set(dois))

        results.append(
            self._result(
                check_id="fabrication.unresolvable_pmid",
                severity=CheckSeverity.INFO,
                passed=True,
                location="citations",
                message=(
                    f"Fabrication check stubbed — {identifier_count} identifiers "
                    f"({len(set(pmids))} PMIDs, {len(set(dois))} DOIs) extracted "
                    f"but not yet validated against PubMed."
                ),
            )
        )

        return results
