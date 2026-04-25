"""Placeholder detection checks."""

from __future__ import annotations

import re

from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec

PLACEHOLDER_RE = re.compile(
    r"\bTBD\b|\bTODO\b|\[FILL IN\]|\[PLACEHOLDER\]|\bXXX\b|lorem ipsum",
    re.IGNORECASE,
)

NUMERIC_STUB_RE = re.compile(
    r"\b0\.00\b|(?<!\w)N/A(?!\w)|(?<!\w)—(?!\w)",
)


@CheckRegistry.register
class PlaceholdersCheck(BaseCheck):
    """Detect placeholder text and stub values in artifacts."""

    category = "placeholders"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []

        corpus = artifact.content
        for section in artifact.sections:
            corpus += " " + str(section.get("body", ""))
            corpus += " " + str(section.get("content", ""))

        # ── literal placeholder markers ─────────────────────────────────
        matches = PLACEHOLDER_RE.findall(corpus)
        if matches:
            unique = sorted(set(m.upper() for m in matches))
            results.append(
                self._result(
                    check_id="placeholders.detected",
                    severity=CheckSeverity.BLOCK,
                    passed=False,
                    location="content",
                    message=f"Placeholder markers found: {', '.join(unique)}.",
                )
            )

        # ── numeric stubs ───────────────────────────────────────────────
        # Only flag in sections that should carry real data
        for section in artifact.sections:
            body = str(section.get("body", section.get("content", "")))
            section_id = section.get("section_id", "unknown")
            stub_matches = NUMERIC_STUB_RE.findall(body)
            if stub_matches:
                results.append(
                    self._result(
                        check_id="placeholders.numeric_stub",
                        severity=CheckSeverity.WARNING,
                        passed=False,
                        location=f"sections.{section_id}",
                        message=(
                            f"Stub numeric values in section '{section_id}': "
                            f"{', '.join(sorted(set(stub_matches)))}."
                        ),
                    )
                )

        if not results:
            results.append(
                self._result(
                    check_id="placeholders.detected",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="No placeholders detected.",
                )
            )

        return results
