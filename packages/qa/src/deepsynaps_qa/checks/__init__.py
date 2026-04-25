"""Check infrastructure: BaseCheck ABC and CheckRegistry."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec


class BaseCheck(ABC):
    """Abstract base class for all QA checks.

    Subclasses must set ``category`` (e.g. ``"sections"``, ``"citations"``)
    and implement :meth:`run`.
    """

    category: ClassVar[str]

    @abstractmethod
    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        """Execute the check and return results."""

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _result(
        check_id: str,
        severity: CheckSeverity,
        passed: bool,
        location: str = "",
        message: str = "",
        detail: str = "",
    ) -> CheckResult:
        return CheckResult(
            check_id=check_id,
            severity=severity,
            passed=passed,
            location=location,
            message=message,
            detail=detail,
        )


class CheckRegistry:
    """Collects and instantiates :class:`BaseCheck` subclasses."""

    _registry: ClassVar[dict[str, list[type[BaseCheck]]]] = {}

    @classmethod
    def register(cls, check_cls: type[BaseCheck]) -> type[BaseCheck]:
        """Decorator that registers a check class by its ``category``."""
        category = check_cls.category
        cls._registry.setdefault(category, []).append(check_cls)
        return check_cls

    @classmethod
    def all_checks(cls) -> dict[str, list[type[BaseCheck]]]:
        return dict(cls._registry)

    @classmethod
    def get_checks_for_spec(cls, spec: QASpec) -> list[BaseCheck]:
        """Instantiate all check classes whose category appears in *spec.check_ids*.

        If ``spec.check_ids`` is empty, all registered checks are returned.
        """
        wanted_categories: set[str] = set()
        for cid in spec.check_ids:
            # check_ids may be full IDs like "sections.missing_required"
            # or just category names like "sections"
            wanted_categories.add(cid.split(".")[0])

        instances: list[BaseCheck] = []
        for category, classes in cls._registry.items():
            if not spec.check_ids or category in wanted_categories:
                for klass in classes:
                    instances.append(klass())
        return instances

    @classmethod
    def reset(cls) -> None:
        """Clear the registry (useful for tests)."""
        cls._registry.clear()


def _ensure_checks_imported() -> None:
    """Force-import all built-in check modules so they self-register."""
    import deepsynaps_qa.checks.banned_terms as _
    import deepsynaps_qa.checks.citations as _  # noqa: F811
    import deepsynaps_qa.checks.fabrication as _  # noqa: F811
    import deepsynaps_qa.checks.language as _  # noqa: F811
    import deepsynaps_qa.checks.placeholders as _  # noqa: F811
    import deepsynaps_qa.checks.redaction as _  # noqa: F811
    import deepsynaps_qa.checks.schema as _  # noqa: F811
    import deepsynaps_qa.checks.sections as _  # noqa: F811, F401


__all__ = ["BaseCheck", "CheckRegistry", "_ensure_checks_imported"]
