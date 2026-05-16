"""Safety and governance enforcement for all intelligence outputs."""

import re
from typing import Dict, List, Any

from contracts import IntelligenceOutput


class SafetyGovernance:
    """Enforces safety rules on all intelligence outputs."""

    DISALLOWED_PATTERNS = [
        r"\bcaused\s+by\b",
        r"\bcauses\b",
        r"\bproven\b",
        r"\bdefinitely\b",
        r"\bautonomous\s+diagnosis\b",
        r"\bautonomous\s+treatment\b",
        r"\btreatment\s+recommendation\b",
        r"\bprescribe\b",
        r"\bblack.box\b",
        r"\bcertain\b",
        r"\bguaranteed\b",
        r"\bwill\s+definitely\b",
        r"\bdiagnose\s+with\s+certainty\b",
    ]

    REQUIRED_CORRELATION_LABEL = "Temporal association only. Not causal proof."
    REQUIRED_HYPOTHESIS_LABEL = "Ranked clinical hypothesis. Requires clinician review."
    REQUIRED_REVIEW_LABEL = "Decision support only. Requires clinician review."
    MAX_CONFIDENCE = 0.95

    @classmethod
    def validate_output(cls, output: IntelligenceOutput) -> Dict[str, Any]:
        """Validate an intelligence output against safety rules."""
        errors = []
        warnings = []

        # Rule 1: clinician_review_required must be True
        if not output.clinician_review_required:
            errors.append("clinician_review_required must be True for all insights")
            output.clinician_review_required = True

        # Rule 2: safety_labels must be populated
        if not output.safety_labels:
            errors.append("safety_labels must be populated")
            output.safety_labels = [cls.REQUIRED_REVIEW_LABEL]

        # Rule 3: No causal overclaiming in summary
        if cls.contains_causal_overclaiming(output.summary):
            errors.append(f"Summary contains causal overclaiming: {output.summary[:100]}")
            output.summary = cls.sanitize_summary(output.summary)

        # Rule 4: Confidence must be < 0.95
        if output.confidence >= cls.MAX_CONFIDENCE:
            warnings.append(f"Confidence {output.confidence} capped to {cls.MAX_CONFIDENCE - 0.01}")
            output.confidence = cls.MAX_CONFIDENCE - 0.01

        # Rule 5: uncertainty_drivers must be populated
        if not output.uncertainty_drivers:
            errors.append("uncertainty_drivers must be populated")
            output.uncertainty_drivers = ["Limited multimodal data available", "Temporal association only"]

        # Rule 6: research_only based on evidence grade
        has_low_grade = any(
            ev.get("evidence_grade", "D") in ("C", "D")
            for ev in output.evidence_links
        )
        if has_low_grade and not output.research_only:
            output.research_only = True

        # Rule 7: Type-specific labels
        if output.insight_type == "correlation" and cls.REQUIRED_CORRELATION_LABEL not in output.safety_labels:
            output.safety_labels.append(cls.REQUIRED_CORRELATION_LABEL)

        if output.insight_type == "hypothesis" and cls.REQUIRED_HYPOTHESIS_LABEL not in output.safety_labels:
            output.safety_labels.append(cls.REQUIRED_HYPOTHESIS_LABEL)

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "corrected": output,
        }

    @classmethod
    def contains_causal_overclaiming(cls, text: str) -> bool:
        """Check if text contains causal overclaiming language."""
        if not text:
            return False
        for pattern in cls.DISALLOWED_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    @classmethod
    def sanitize_summary(cls, summary: str) -> str:
        """Replace causal language with safe alternatives."""
        replacements = [
            (r"\bcaused\s+by\b", "associated with"),
            (r"\bcauses\b", "is associated with"),
            (r"\bproven\b", "suggested by evidence"),
            (r"\bdefinitely\b", "possibly"),
            (r"\bcertain\b", "uncertain"),
            (r"\bguaranteed\b", "not guaranteed"),
            (r"\bwill\s+definitely\b", "may"),
            (r"\bdiagnose\s+with\s+certainty\b", "suggest further evaluation for"),
        ]
        result = summary
        for pattern, replacement in replacements:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        return result + " [Temporal association only. Not causal proof.]"

    @classmethod
    def apply_all(cls, outputs: List[IntelligenceOutput]) -> List[IntelligenceOutput]:
        """Apply safety governance to all outputs."""
        validated = []
        for output in outputs:
            result = cls.validate_output(output)
            validated.append(result["corrected"])
        return validated
