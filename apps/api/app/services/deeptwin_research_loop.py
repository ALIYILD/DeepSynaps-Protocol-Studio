"""DeepTwin research loop — placeholder module (DISABLED in production).

This module sketches the safe internal "research loop" architecture:
hypothesis → eval against synthetic/de-identified data → score against
outcome metrics → keep/discard rule changes → log every experiment →
require human approval before any update affects production output.

It is intentionally NOT wired to any router and ``ENABLED = False`` so
nothing here can change clinical output without an explicit, audited
human approval step we have not built yet.

Why this file exists
--------------------
- Documents the contract that future research-loop work must follow.
- Provides the names referenced from the DeepTwin governance report.
- Lets engineers stub eval runs locally without touching production.

If you turn this on, you must also add:
- a database-backed audit trail per experiment,
- a human approval gate UI,
- a kill-switch that disables auto-promotion globally.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

ENABLED: bool = False


@dataclass(frozen=True)
class HypothesisRecord:
    id: str
    statement: str
    target_metric: str
    expected_direction: str  # "increase" | "decrease"
    rationale: str
    evidence_grade: str = "low"


@dataclass
class TwinHypothesisRegistry:
    """Append-only registry of hypotheses being evaluated."""

    items: list[HypothesisRecord] = field(default_factory=list)

    def register(self, h: HypothesisRecord) -> HypothesisRecord:
        if not ENABLED:
            # Permitted: registration is read-only signalling, no production effect.
            self.items.append(h)
            return h
        raise RuntimeError("Research loop is disabled in production")

    def list(self) -> list[HypothesisRecord]:
        return list(self.items)


@dataclass
class TwinExperimentLog:
    """JSONL-like in-memory log of evaluation runs.

    A real implementation must persist to a database with patient_id
    redacted, dataset hash recorded, model/prompt versions captured,
    and human approver fields required before promotion.
    """

    runs: list[dict[str, Any]] = field(default_factory=list)

    def log(self, run: dict[str, Any]) -> None:
        run = {**run, "logged_at": datetime.now(timezone.utc).isoformat()}
        self.runs.append(run)

    def all(self) -> list[dict[str, Any]]:
        return list(self.runs)


@dataclass
class TwinEvalHarness:
    """Score predictions against historical outcome metrics on synthetic data only."""

    score_fn: Callable[[dict[str, Any], dict[str, Any]], float]
    log: TwinExperimentLog = field(default_factory=TwinExperimentLog)

    def evaluate(
        self,
        hypothesis: HypothesisRecord,
        prediction: dict[str, Any],
        ground_truth: dict[str, Any],
        *,
        dataset_id: str = "synthetic_demo",
    ) -> dict[str, Any]:
        if not ENABLED:
            # We allow eval calls to run, but the result CANNOT be promoted
            # to production without a human approval step.
            score = float(self.score_fn(prediction, ground_truth))
            run = {
                "hypothesis_id": hypothesis.id,
                "dataset_id": dataset_id,
                "score": score,
                "promoted": False,
                "approval_required": True,
                "blocked_reason": "research loop disabled in production",
            }
            self.log.log(run)
            return run
        raise RuntimeError("Research loop is disabled in production")
