"""Citation density and format checks."""

from __future__ import annotations

import re
from collections import Counter

from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec

PMID_RE = re.compile(r"^\d{7,8}$")
DOI_RE = re.compile(r"\b10\.\d{4,9}/[^\s\"'<>]+", re.IGNORECASE)
PLACEHOLDER_RE = re.compile(
    r"\[CITATION NEEDED\]|\[PLACEHOLDER\]|\[REF\]|\bTBD\b|\bXXX\b",
    re.IGNORECASE,
)


@CheckRegistry.register
class CitationsCheck(BaseCheck):
    """Verify citation count and format meet spec requirements."""

    category = "citations"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []
        citations = artifact.citations

        # ── no references at all ────────────────────────────────────────
        if not citations:
            results.append(
                self._result(
                    check_id="citations.no_references",
                    severity=CheckSeverity.BLOCK,
                    passed=False,
                    location="citations",
                    message="Zero citations present.",
                )
            )
            return results

        # ── placeholder references ──────────────────────────────────────
        full_text = artifact.content
        for cit in citations:
            full_text += " " + str(cit.get("title", "")) + " " + str(cit.get("text", ""))

        if PLACEHOLDER_RE.search(full_text):
            results.append(
                self._result(
                    check_id="citations.placeholder_ref",
                    severity=CheckSeverity.BLOCK,
                    passed=False,
                    location="citations",
                    message="Citation text contains placeholder markers.",
                )
            )

        # ── PMID validation ─────────────────────────────────────────────
        valid_pmids: list[str] = []
        pmid_counter: Counter[str] = Counter()
        for cit in citations:
            pmid = str(cit.get("pmid", "")).strip()
            if pmid:
                pmid_counter[pmid] += 1
                if PMID_RE.match(pmid):
                    valid_pmids.append(pmid)
                else:
                    results.append(
                        self._result(
                            check_id="citations.missing_pmid",
                            severity=CheckSeverity.WARNING,
                            passed=False,
                            location=f"citations.pmid={pmid}",
                            message=f"PMID '{pmid}' does not match expected pattern (7-8 digits).",
                        )
                    )
            else:
                # No PMID at all — check if DOI is present as fallback
                doi = str(cit.get("doi", "")).strip()
                if not doi or not DOI_RE.search(doi):
                    results.append(
                        self._result(
                            check_id="citations.missing_pmid",
                            severity=CheckSeverity.WARNING,
                            passed=False,
                            location="citations",
                            message="Citation lacks a valid PMID or DOI.",
                        )
                    )

        # ── below floor ─────────────────────────────────────────────────
        if len(valid_pmids) < spec.citation_floor:
            results.append(
                self._result(
                    check_id="citations.below_floor",
                    severity=CheckSeverity.WARNING,
                    passed=False,
                    location="citations",
                    message=(
                        f"Only {len(valid_pmids)} valid PMIDs found; "
                        f"spec requires at least {spec.citation_floor}."
                    ),
                )
            )

        # ── duplicate PMIDs ─────────────────────────────────────────────
        for pmid, count in pmid_counter.items():
            if count > 1:
                results.append(
                    self._result(
                        check_id="citations.duplicate_pmid",
                        severity=CheckSeverity.INFO,
                        passed=False,
                        location=f"citations.pmid={pmid}",
                        message=f"PMID '{pmid}' cited {count} times.",
                    )
                )

        if not results:
            results.append(
                self._result(
                    check_id="citations.no_references",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="All citation checks passed.",
                )
            )

        return results
