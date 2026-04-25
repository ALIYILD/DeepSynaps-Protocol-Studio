"""QA Engine — orchestrates all checks for an artifact."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from deepsynaps_qa.checks import CheckRegistry, _ensure_checks_imported
from deepsynaps_qa.models import (
    Artifact,
    ArtifactType,
    QAResult,
    QASpec,
)
from deepsynaps_qa.specs import get_spec_for_artifact_type
from deepsynaps_qa.verdicts import compute_score, compute_verdict


class QAEngine:
    """Orchestrates QA checks, scoring, and verdict computation."""

    def __init__(self) -> None:
        # Ensure all built-in checks are registered
        _ensure_checks_imported()

    def run(self, artifact: Artifact, spec: QASpec | None = None) -> QAResult:
        """Run QA checks against an artifact.

        If *spec* is not provided, the engine looks up the spec by
        ``artifact.artifact_type``.
        """
        if spec is None:
            spec = get_spec_for_artifact_type(artifact.artifact_type)
        if spec is None:
            return QAResult(
                run_id=str(uuid4()),
                artifact_id=artifact.artifact_id,
                spec_id="unknown",
                verdict="FAIL",
                timestamp_utc=datetime.now(tz=UTC).isoformat(),
            )

        # Gather checks for this spec
        check_instances = CheckRegistry.get_checks_for_spec(spec)

        # Run all checks
        all_results = []
        for check in check_instances:
            results = check.run(artifact, spec)
            all_results.extend(results)

        # Score and verdict
        score = compute_score(all_results)
        verdict = compute_verdict(score)

        run_id = str(uuid4())
        timestamp = datetime.now(tz=UTC).isoformat()

        return QAResult(
            run_id=run_id,
            artifact_id=artifact.artifact_id,
            spec_id=spec.spec_id,
            check_results=all_results,
            score=score,
            verdict=verdict,
            hash_chain="",  # Populated by audit layer
            timestamp_utc=timestamp,
        )

    def run_batch(
        self,
        artifacts: list[Artifact],
        spec_map: dict[ArtifactType, QASpec] | None = None,
    ) -> list[QAResult]:
        """Run QA on multiple artifacts."""
        results = []
        for artifact in artifacts:
            spec = None
            if spec_map:
                spec = spec_map.get(artifact.artifact_type)
            results.append(self.run(artifact, spec))
        return results
