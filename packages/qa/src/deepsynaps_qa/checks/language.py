"""Reading-level and language quality checks."""

from __future__ import annotations

import re

from deepsynaps_qa._compat import get_textstat
from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec

CERTAINTY_TERMS = re.compile(
    r"\b(proven|guarantees?|cures?|definitively|100\s*%)\b",
    re.IGNORECASE,
)

CONFIDENCE_LABELS = {"preliminary", "indicative", "strong", "low", "moderate", "high"}


@CheckRegistry.register
class LanguageCheck(BaseCheck):
    """Check reading level and language quality."""

    category = "language"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []
        content = artifact.content

        # ── reading level ───────────────────────────────────────────────
        textstat = get_textstat()
        if textstat is not None and content.strip():
            grade = textstat.flesch_kincaid_grade(content)
            if grade < spec.reading_level_min or grade > spec.reading_level_max:
                results.append(
                    self._result(
                        check_id="language.reading_level_out_of_range",
                        severity=CheckSeverity.WARNING,
                        passed=False,
                        location="content",
                        message=(
                            f"Flesch-Kincaid grade {grade:.1f} outside range "
                            f"[{spec.reading_level_min}, {spec.reading_level_max}]."
                        ),
                    )
                )
        elif textstat is None:
            results.append(
                self._result(
                    check_id="language.reading_level_out_of_range",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="textstat library not available; reading-level check skipped.",
                )
            )

        # ── excessive certainty ─────────────────────────────────────────
        matches = CERTAINTY_TERMS.findall(content)
        if matches:
            results.append(
                self._result(
                    check_id="language.excessive_certainty",
                    severity=CheckSeverity.WARNING,
                    passed=False,
                    location="content",
                    message=(
                        f"Absolute-certainty terms detected: "
                        f"{', '.join(sorted(set(m.lower() for m in matches)))}."
                    ),
                )
            )

        # ── missing confidence label ────────────────────────────────────
        content_lower = content.lower()
        has_confidence = any(label in content_lower for label in CONFIDENCE_LABELS)
        if not has_confidence and content.strip():
            results.append(
                self._result(
                    check_id="language.missing_confidence_label",
                    severity=CheckSeverity.INFO,
                    passed=False,
                    location="content",
                    message="No confidence label found in artifact content.",
                )
            )

        if not results:
            results.append(
                self._result(
                    check_id="language.reading_level_out_of_range",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="All language checks passed.",
                )
            )

        return results
