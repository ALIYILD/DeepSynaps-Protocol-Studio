"""Required-section presence checks."""

from __future__ import annotations

from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec


@CheckRegistry.register
class SectionsCheck(BaseCheck):
    """Verify that all required sections are present and non-empty."""

    category = "sections"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []
        present_ids = {s.get("section_id", "") for s in artifact.sections}
        present_ordered: list[str] = [s.get("section_id", "") for s in artifact.sections]

        for req in spec.required_sections:
            if req not in present_ids:
                results.append(
                    self._result(
                        check_id="sections.missing_required",
                        severity=CheckSeverity.BLOCK,
                        passed=False,
                        location=f"sections.{req}",
                        message=f"Required section '{req}' is absent.",
                    )
                )
            else:
                # Find section content and check word count
                section_body = ""
                for s in artifact.sections:
                    if s.get("section_id") == req:
                        section_body = str(s.get("body", s.get("content", "")))
                        break
                word_count = len(section_body.split())
                if word_count < 50:
                    results.append(
                        self._result(
                            check_id="sections.empty_required",
                            severity=CheckSeverity.WARNING,
                            passed=False,
                            location=f"sections.{req}",
                            message=(
                                f"Required section '{req}' has only {word_count} words "
                                f"(minimum 50)."
                            ),
                        )
                    )

        # Check ordering — only for sections that are present
        expected_order = [s for s in spec.required_sections if s in present_ids]
        actual_order = [s for s in present_ordered if s in set(expected_order)]
        if actual_order != expected_order:
            results.append(
                self._result(
                    check_id="sections.ordering_violation",
                    severity=CheckSeverity.INFO,
                    passed=False,
                    location="sections",
                    message="Sections present but not in canonical order.",
                )
            )

        # If nothing failed, emit a passing result
        if not results:
            results.append(
                self._result(
                    check_id="sections.missing_required",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="All required sections present and non-empty.",
                )
            )

        return results
