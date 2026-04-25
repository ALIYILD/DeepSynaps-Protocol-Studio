"""PII / PHI redaction guard using Presidio (optional dependency)."""

from __future__ import annotations

import re

from deepsynaps_qa._compat import get_presidio_analyzer
from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec

# Secondary regex patterns for partial redaction
PARTIAL_REDACTION_PATTERNS = [
    re.compile(r"[A-Z]\*+\s+[A-Z][a-z]+"),          # J*** Smith
    re.compile(r"\d{3}-\*{2}-\d{4}"),                 # 123-**-4567
    re.compile(r"[A-Z][a-z]+\s+\*{3,}"),              # John ****
    re.compile(r"\*{3,}\s+[A-Z][a-z]+"),              # **** Smith
]

PRESIDIO_ENTITY_TYPES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "US_SSN",
    "UK_NHS",
    "IP_ADDRESS",
]


@CheckRegistry.register
class RedactionCheck(BaseCheck):
    """Guard against PII escaping into artifact bodies."""

    category = "redaction"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []

        corpus = artifact.content
        for section in artifact.sections:
            corpus += " " + str(section.get("body", ""))
            corpus += " " + str(section.get("content", ""))

        analyzer = get_presidio_analyzer()

        if analyzer is not None:
            findings = analyzer.analyze(
                text=corpus,
                entities=PRESIDIO_ENTITY_TYPES,
                language="en",
            )
            high_confidence = [f for f in findings if f.score >= 0.7]
            if high_confidence:
                entity_types = sorted({f.entity_type for f in high_confidence})
                results.append(
                    self._result(
                        check_id="redaction.pii_detected",
                        severity=CheckSeverity.BLOCK,
                        passed=False,
                        location="content",
                        message=(
                            f"PII detected ({len(high_confidence)} findings): "
                            f"{', '.join(entity_types)}."
                        ),
                    )
                )
        else:
            results.append(
                self._result(
                    check_id="redaction.pii_detected",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message=(
                        "Presidio not installed; PII check skipped. "
                        "Install deepsynaps-qa[redaction] for full PII detection."
                    ),
                )
            )

        # ── partial redaction (secondary regex pass) ────────────────────
        for pattern in PARTIAL_REDACTION_PATTERNS:
            match = pattern.search(corpus)
            if match:
                results.append(
                    self._result(
                        check_id="redaction.partial_redaction",
                        severity=CheckSeverity.WARNING,
                        passed=False,
                        location="content",
                        message=f"Partial redaction detected: '{match.group()}'.",
                    )
                )
                break  # One finding is enough to flag

        if not results:
            results.append(
                self._result(
                    check_id="redaction.pii_detected",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="No PII detected.",
                )
            )

        return results
