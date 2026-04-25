"""Banned-term scanner."""

from __future__ import annotations

from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec

# Global banned terms (always checked regardless of artifact type)
GLOBAL_BANNED_TERMS: list[str] = [
    "digital twin",
    "NeuroTwin",
    "you must take",
    "prescribe",
    "administer",
]


@CheckRegistry.register
class BannedTermsCheck(BaseCheck):
    """Scan the full artifact plain text for prohibited terms."""

    category = "banned_terms"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []

        # Build full plain-text corpus including citation fields
        corpus = artifact.content
        for cit in artifact.citations:
            corpus += " " + str(cit.get("title", ""))
            corpus += " " + str(cit.get("text", ""))
            corpus += " " + str(cit.get("abstract", ""))
        for section in artifact.sections:
            corpus += " " + str(section.get("body", ""))
            corpus += " " + str(section.get("content", ""))

        corpus_lower = corpus.lower()

        # Combine global + spec-specific banned terms
        all_banned = list(GLOBAL_BANNED_TERMS)
        for term in spec.banned_terms:
            if term.lower() not in {t.lower() for t in all_banned}:
                all_banned.append(term)

        for term in all_banned:
            if term.lower() in corpus_lower:
                results.append(
                    self._result(
                        check_id="banned_terms.detected",
                        severity=CheckSeverity.BLOCK,
                        passed=False,
                        location="content",
                        message=f"Banned term detected: '{term}'.",
                    )
                )

        if not results:
            results.append(
                self._result(
                    check_id="banned_terms.detected",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="No banned terms found.",
                )
            )

        return results
