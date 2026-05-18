"""
response_synthesizer.py — Intelligent Synaps v4
=================================================
Converts structured adapter results into natural language with citations,
uncertainty quantification, and structured data output.

Features:
- Human-readable summary generation
- Citation-aware response formatting
- Uncertainty quantification per claim
- Multi-modal output: text + structured data + visualization hints
- Confidence-based filtering and ranking
"""

from __future__ import annotations

import asyncio
import logging
import textwrap
import unittest
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

from pydantic import BaseModel, Field

logger = logging.getLogger("intelligent_synaps.response_synthesizer")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class Source(BaseModel):
    """A cited source."""

    source_name: str
    source_id: str = ""
    title: str = ""
    url: str = ""
    access_date: str = ""
    confidence: float = 0.8

    def format_citation(self, style: str = "apa") -> str:
        if style == "apa":
            return f"{self.source_name}. ({self.access_date[:4] if self.access_date else 'n.d.'}). {self.title}."
        elif style == "ieee":
            return f"[{self.source_name}] {self.title}"
        elif style == "vancouver":
            return f"{self.title}. {self.source_name}."
        return f"{self.source_name}: {self.title}"


class Citation(BaseModel):
    """Formatted citation for response output."""

    number: int
    source: str
    title: str
    url: str = ""
    context: str = ""  # the specific claim being cited
    confidence: float = 0.0


class UncertaintyBlock(BaseModel):
    """Uncertainty quantification for a claim."""

    claim: str
    confidence_level: str  # high, moderate, low, very_low
    confidence_score: float
    uncertainty_reason: str = ""
    caveats: List[str] = Field(default_factory=list)


class StructuredDataBlock(BaseModel):
    """Structured data component of a response."""

    data_type: str  # table, key_value, list, json
    title: str
    content: Any
    source_citations: List[int] = Field(default_factory=list)


class VisualizationHint(BaseModel):
    """Hint for frontend visualization."""

    viz_type: str  # bar_chart, line_chart, heatmap, network, timeline, table
    title: str
    description: str
    data_keys: List[str] = Field(default_factory=list)
    recommended_dimensions: Dict[str, int] = Field(default_factory=dict)


class AdapterResult(BaseModel):
    """A single result from an adapter."""

    adapter_name: str
    result_id: str = ""
    data: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.8
    source_name: str = ""
    entity_type: str = ""
    entity_id: str = ""
    relevance_score: float = 0.5
    retrieved_at: str = ""


class SynthesizedResponse(BaseModel):
    """Complete synthesized response."""

    response_id: str = ""
    query: str = ""
    natural_language: str = ""
    summary: str = ""
    structured_data: List[StructuredDataBlock] = Field(default_factory=list)
    citations: List[Citation] = Field(default_factory=list)
    uncertainty_blocks: List[UncertaintyBlock] = Field(default_factory=list)
    visualization_hints: List[VisualizationHint] = Field(default_factory=list)
    sources_used: List[str] = Field(default_factory=list)
    overall_confidence: float = 0.0
    confidence_grade: str = "F"
    requires_caution: bool = False
    caution_notes: List[str] = Field(default_factory=list)
    generated_at: str = ""
    processing_time_ms: float = 0.0

    class Config:
        arbitrary_types_allowed = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "response_id": self.response_id,
            "query": self.query,
            "summary": self.summary,
            "natural_language": self.natural_language,
            "structured_data": [s.dict() for s in self.structured_data],
            "citations": [c.dict() for c in self.citations],
            "uncertainty_blocks": [u.dict() for u in self.uncertainty_blocks],
            "visualization_hints": [v.dict() for v in self.visualization_hints],
            "sources_used": self.sources_used,
            "overall_confidence": self.overall_confidence,
            "confidence_grade": self.confidence_grade,
            "requires_caution": self.requires_caution,
            "caution_notes": self.caution_notes,
            "generated_at": self.generated_at,
        }

    def to_markdown(self) -> str:
        """Convert response to Markdown format."""
        lines = [
            f"# Response: {self.query[:60]}",
            "",
            f"**Confidence:** {self.overall_confidence:.0%} ({self.confidence_grade})",
            "",
            "## Summary",
            self.summary,
            "",
            "## Details",
            self.natural_language,
            "",
        ]
        if self.citations:
            lines.append("## Sources")
            for c in self.citations:
                lines.append(f"{c.number}. **{c.source}** — {c.title}")
            lines.append("")
        if self.requires_caution:
            lines.append("## ⚠️ Caution")
            for note in self.caution_notes:
                lines.append(f"- {note}")
            lines.append("")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# ResponseSynthesizer
# ---------------------------------------------------------------------------

class ResponseSynthesizer:
    """Converts structured adapter results into natural language with citations.

    Usage:
        synth = ResponseSynthesizer()
        response = await synth.synthesize(results, query)
        print(response.natural_language)
        print(response.to_markdown())
    """

    # Grade thresholds
    GRADES = [
        (0.90, "A+"), (0.80, "A"), (0.70, "B"),
        (0.60, "C"), (0.40, "D"), (0.00, "F"),
    ]

    # Confidence level thresholds
    CONFIDENCE_LEVELS = [
        (0.85, "high"), (0.60, "moderate"), (0.40, "low"), (0.00, "very_low"),
    ]

    def __init__(self) -> None:
        self._response_history: List[SynthesizedResponse] = []
        logger.info("ResponseSynthesizer initialised")

    # -- Main API -------------------------------------------------------------

    async def synthesize(
        self,
        results: List[AdapterResult],
        query: str,
        include_structured: bool = True,
        include_visualizations: bool = True,
        max_results: int = 20,
    ) -> SynthesizedResponse:
        """Synthesize adapter results into a natural language response.

        Parameters
        ----------
        results:
            List of adapter results.
        query:
            Original query string.
        include_structured:
            Whether to include structured data blocks.
        include_visualizations:
            Whether to include visualization hints.
        max_results:
            Maximum results to include.

        Returns
        -------
        SynthesizedResponse with NL text, citations, structured data, etc.
        """
        import time
        start_time = time.time()

        if not results:
            return self._empty_response(query)

        # 1. Rank by confidence
        ranked = self._rank_results(results)
        top_results = ranked[:max_results]

        # 2. Group related findings
        groups = self._group_findings(top_results)

        # 3. Generate NL summary
        summary = self.generate_summary(top_results)

        # 4. Generate detailed NL
        nl_text = self._generate_detailed_text(groups, query)

        # 5. Format citations
        sources = self._extract_sources(top_results)
        citations = self.format_citations(sources)

        # 6. Quantify uncertainty
        uncertainty = self._quantify_uncertainty(top_results, groups)

        # 7. Structured data
        structured: List[StructuredDataBlock] = []
        if include_structured:
            structured = self._generate_structured_data(groups)

        # 8. Visualization hints
        viz: List[VisualizationHint] = []
        if include_visualizations:
            viz = self._generate_visualization_hints(groups, query)

        # 9. Overall confidence
        overall_conf = self._calculate_overall_confidence(top_results)
        grade = self._grade(overall_conf)

        # 10. Caution flags
        caution, caution_notes = self._check_cautions(top_results, uncertainty)

        response = SynthesizedResponse(
            response_id=self._generate_response_id(query),
            query=query,
            natural_language=nl_text,
            summary=summary,
            structured_data=structured,
            citations=citations,
            uncertainty_blocks=uncertainty,
            visualization_hints=viz,
            sources_used=list(set(r.adapter_name for r in top_results)),
            overall_confidence=round(overall_conf, 3),
            confidence_grade=grade,
            requires_caution=caution,
            caution_notes=caution_notes,
            generated_at=datetime.now(timezone.utc).isoformat(),
            processing_time_ms=round((time.time() - start_time) * 1000, 1),
        )

        self._response_history.append(response)
        logger.info(
            "Synthesized response for '%s...': grade=%s, sources=%d, "
            "citations=%d, caution=%s",
            query[:40],
            grade,
            len(response.sources_used),
            len(citations),
            caution,
        )
        return response

    def generate_summary(self, results: List[AdapterResult]) -> str:
        """Generate a human-readable summary of results.

        Creates 2-4 sentence overview covering the most confident findings.
        """
        if not results:
            return "No results found for this query."

        top = results[0]
        entity = top.data.get("name", top.data.get("preferred_name", "the queried entity"))
        entity_type = top.entity_type or "entity"

        sentences: List[str] = []

        # Opening sentence
        source_list = ", ".join(sorted(set(r.adapter_name for r in results[:3])))
        sentences.append(
            f"Found information about {entity} ({entity_type}) "
            f"from {len(results)} source{'s' if len(results) > 1 else ''} "
            f"including {source_list}."
        )

        # Key facts from top results
        key_facts = self._extract_key_facts(results[:5])
        if key_facts:
            fact_sentence = "Key findings: " + "; ".join(key_facts[:3]) + "."
            sentences.append(fact_sentence)

        # Confidence summary
        avg_conf = sum(r.confidence for r in results) / len(results)
        level = self._confidence_level(avg_conf)
        sentences.append(
            f"Overall evidence quality is {level} "
            f"(average confidence: {avg_conf:.0%})."
        )

        # Safety note if low confidence
        if avg_conf < 0.50:
            sentences.append(
                "⚠️ Evidence quality is low — results should be interpreted with caution."
            )

        return " ".join(sentences)

    def format_citations(self, sources: List[Source]) -> List[Citation]:
        """Format sources as numbered citations."""
        citations: List[Citation] = []
        for i, src in enumerate(sources, 1):
            citations.append(
                Citation(
                    number=i,
                    source=src.source_name,
                    title=src.title or f"Data from {src.source_name}",
                    url=src.url,
                    confidence=src.confidence,
                )
            )
        return citations

    # -- Internal helpers -----------------------------------------------------

    def _rank_results(
        self, results: List[AdapterResult]
    ) -> List[AdapterResult]:
        """Rank results by composite score (confidence × relevance)."""
        def score(r: AdapterResult) -> float:
            return r.confidence * 0.6 + r.relevance_score * 0.4
        return sorted(results, key=score, reverse=True)

    def _group_findings(
        self, results: List[AdapterResult]
    ) -> Dict[str, List[AdapterResult]]:
        """Group results by category/entity type."""
        groups: Dict[str, List[AdapterResult]] = {}
        for r in results:
            key = r.entity_type or r.data.get("category", "general")
            groups.setdefault(key, []).append(r)
        return groups

    def _extract_key_facts(
        self, results: List[AdapterResult]
    ) -> List[str]:
        """Extract key facts from results for summary."""
        facts: List[str] = []
        for r in results:
            data = r.data
            if "mechanism" in data:
                facts.append(f"mechanism: {data['mechanism']}")
            elif "indication" in data:
                facts.append(f"used for: {data['indication']}")
            elif "effect_size" in data:
                facts.append(f"effect size: {data['effect_size']}")
            elif "dosage" in data:
                facts.append(f"dosage: {data['dosage']}")
            elif "half_life" in data:
                facts.append(f"half-life: {data['half_life']}")
            elif "response_rate" in data:
                facts.append(f"response rate: {data['response_rate']}")
        return facts

    def _extract_sources(
        self, results: List[AdapterResult]
    ) -> List[Source]:
        """Extract unique sources from results."""
        seen: set = set()
        sources: List[Source] = []
        for r in results:
            src_name = r.source_name or r.adapter_name
            key = f"{src_name}:{r.result_id}"
            if key not in seen:
                seen.add(key)
                sources.append(
                    Source(
                        source_name=src_name,
                        source_id=r.result_id,
                        title=r.data.get("title", ""),
                        confidence=r.confidence,
                        access_date=datetime.now(timezone.utc).isoformat()[:10],
                    )
                )
        return sources

    def _generate_detailed_text(
        self, groups: Dict[str, List[AdapterResult]], query: str
    ) -> str:
        """Generate detailed natural language from grouped findings."""
        paragraphs: List[str] = []

        for category, results in groups.items():
            if not results:
                continue

            # Category header
            cat_title = category.replace("_", " ").title()
            lines: List[str] = [f"### {cat_title}"]

            for r in results:
                name = r.data.get("name", r.data.get("preferred_name", r.entity_id or "Unknown"))
                conf_pct = int(r.confidence * 100)

                # Build fact sentences from data
                fact_parts: List[str] = []
                for key, val in r.data.items():
                    if key in ("name", "preferred_name", "title", "source", "category"):
                        continue
                    if val and str(val).strip():
                        fact_parts.append(f"**{key.replace('_', ' ').title()}**: {val}")

                if fact_parts:
                    lines.append(
                        f"\n**{name}** (confidence: {conf_pct}%):\n"
                        + "\n".join(f"- {fp}" for fp in fact_parts[:8])
                    )
                else:
                    lines.append(
                        f"\n**{name}** (confidence: {confPct}%) — no detailed data available."
                    )

            paragraphs.append("\n".join(lines))

        if not paragraphs:
            return "No detailed findings available."

        return "\n\n".join(paragraphs)

    def _quantify_uncertainty(
        self,
        results: List[AdapterResult],
        groups: Dict[str, List[AdapterResult]],
    ) -> List[UncertaintyBlock]:
        """Generate uncertainty blocks for each finding group."""
        blocks: List[UncertaintyBlock] = []

        for category, group_results in groups.items():
            if not group_results:
                continue

            confs = [r.confidence for r in group_results]
            avg_conf = sum(confs) / len(confs)
            level = self._confidence_level(avg_conf)

            caveats: List[str] = []
            if len(group_results) < 2:
                caveats.append("Only one source available")
            if avg_conf < 0.60:
                caveats.append("Low confidence in source data")
            if any(r.confidence < 0.40 for r in group_results):
                caveats.append("Some sources have very low confidence")

            blocks.append(
                UncertaintyBlock(
                    claim=f"Findings for {category}",
                    confidence_level=level,
                    confidence_score=round(avg_conf, 3),
                    uncertainty_reason="Variability across sources" if len(confs) > 1 else "Limited source diversity",
                    caveats=caveats,
                )
            )

        return blocks

    def _generate_structured_data(
        self, groups: Dict[str, List[AdapterResult]]
    ) -> List[StructuredDataBlock]:
        """Generate structured data blocks."""
        blocks: List[StructuredDataBlock] = []

        for category, results in groups.items():
            if not results:
                continue

            # Create a comparison table
            rows: List[Dict[str, Any]] = []
            for r in results:
                row: Dict[str, Any] = {
                    "source": r.adapter_name,
                    "name": r.data.get("name", r.entity_id),
                    "confidence": r.confidence,
                }
                # Add relevant fields
                for key in ["mechanism", "indication", "dosage", "half_life", "effect_size", "response_rate"]:
                    if key in r.data:
                        row[key] = r.data[key]
                rows.append(row)

            if rows:
                blocks.append(
                    StructuredDataBlock(
                        data_type="table",
                        title=f"{category.replace('_', ' ').title()} Comparison",
                        content=rows,
                    )
                )

            # Key-value for top result
            if results:
                top = results[0]
                kv = {k: v for k, v in top.data.items() if k not in ("name", "title")}
                if kv:
                    blocks.append(
                        StructuredDataBlock(
                            data_type="key_value",
                            title=f"{top.data.get('name', category)} — Details",
                            content=kv,
                        )
                    )

        return blocks

    def _generate_visualization_hints(
        self, groups: Dict[str, List[AdapterResult]], query: str
    ) -> List[VisualizationHint]:
        """Generate visualization hints based on data characteristics."""
        hints: List[VisualizationHint] = []

        # If we have drug comparisons → bar chart or radar chart
        if "drug" in groups or "drug_info" in groups:
            drug_results = groups.get("drug", []) + groups.get("drug_info", [])
            if len(drug_results) >= 2:
                hints.append(
                    VisualizationHint(
                        viz_type="bar_chart",
                        title="Drug Comparison",
                        description="Compare properties across multiple drugs",
                        data_keys=["confidence", "effect_size", "half_life"],
                    )
                )

        # If we have time-based data → timeline
        if any("year" in r.data or "date" in r.data for group in groups.values() for r in group):
            hints.append(
                VisualizationHint(
                    viz_type="timeline",
                    title="Evidence Timeline",
                    description="Temporal distribution of evidence",
                    data_keys=["year", "publication_date"],
                )
            )

        # If we have interaction data → network
        if "interaction" in query.lower() or any(
            "interaction" in r.data for group in groups.values() for r in group
        ):
            hints.append(
                VisualizationHint(
                    viz_type="network",
                    title="Interaction Network",
                    description="Drug-gene or drug-drug interaction network",
                    data_keys=["source", "target", "interaction_type"],
                )
            )

        # If we have multi-source data → comparison heatmap
        total_results = sum(len(g) for g in groups.values())
        if total_results >= 4:
            hints.append(
                VisualizationHint(
                    viz_type="heatmap",
                    title="Source Confidence Matrix",
                    description="Confidence scores across sources and entities",
                    data_keys=["confidence", "relevance_score"],
                )
            )

        return hints

    def _calculate_overall_confidence(
        self, results: List[AdapterResult]
    ) -> float:
        """Calculate overall confidence from all results."""
        if not results:
            return 0.0
        weights = [r.confidence * r.relevance_score for r in results]
        weight_sum = sum(weights)
        conf_sum = sum(r.confidence * w for r, w in zip(results, weights))
        return conf_sum / weight_sum if weight_sum > 0 else 0.0

    def _grade(self, score: float) -> str:
        """Convert score to letter grade."""
        for threshold, grade in self.GRADES:
            if score >= threshold:
                return grade
        return "F"

    def _confidence_level(self, score: float) -> str:
        """Convert score to confidence level string."""
        for threshold, level in self.CONFIDENCE_LEVELS:
            if score >= threshold:
                return level
        return "very_low"

    def _check_cautions(
        self,
        results: List[AdapterResult],
        uncertainty: List[UncertaintyBlock],
    ) -> Tuple[bool, List[str]]:
        """Check if caution flags should be raised."""
        notes: List[str] = []

        avg_conf = sum(r.confidence for r in results) / len(results) if results else 0
        if avg_conf < 0.50:
            notes.append("Low overall confidence in results")
        if len(results) < 2:
            notes.append("Limited number of sources")
        if any(u.confidence_level in ("low", "very_low") for u in uncertainty):
            notes.append("Some findings have low confidence")

        return len(notes) > 0, notes

    def _empty_response(self, query: str) -> SynthesizedResponse:
        """Generate an empty response."""
        return SynthesizedResponse(
            response_id=self._generate_response_id(query),
            query=query,
            natural_language="No results were found for this query. Please try rephrasing or broadening your search.",
            summary="No results found.",
            overall_confidence=0.0,
            confidence_grade="F",
            requires_caution=True,
            caution_notes=["No data available — cannot verify claims"],
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _generate_response_id(query: str) -> str:
        import hashlib
        return hashlib.sha256(
            f"{query}:{datetime.now(timezone.utc)}".encode()
        ).hexdigest()[:16]

    def get_history(self) -> List[SynthesizedResponse]:
        """Return synthesis history."""
        return list(self._response_history)

    def clear_history(self) -> None:
        """Clear synthesis history."""
        self._response_history.clear()


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestResponseSynthesizer(unittest.IsolatedAsyncioTestCase):
    async def test_synthesize_empty(self) -> None:
        synth = ResponseSynthesizer()
        response = await synth.synthesize([], "test query")
        self.assertTrue("No results" in response.natural_language or "not found" in response.natural_language.lower())
        self.assertEqual(response.overall_confidence, 0.0)

    async def test_synthesize_with_results(self) -> None:
        synth = ResponseSynthesizer()
        results = [
            AdapterResult(
                adapter_name="drugbank",
                data={"name": "Sertraline", "mechanism": "SSRI", "half_life": "26h"},
                confidence=0.95,
                entity_type="drug",
                relevance_score=0.9,
            ),
            AdapterResult(
                adapter_name="pubmed",
                data={"name": "Sertraline", "effect_size": "0.65", "indication": "MDD"},
                confidence=0.85,
                entity_type="drug",
                relevance_score=0.8,
            ),
        ]
        response = await synth.synthesize(results, "sertraline mechanism")
        self.assertTrue(len(response.natural_language) > 0)
        self.assertTrue(response.overall_confidence > 0)
        self.assertTrue(len(response.citations) > 0)
        self.assertTrue(len(response.structured_data) > 0)

    async def test_summary_generation(self) -> None:
        synth = ResponseSynthesizer()
        results = [
            AdapterResult(adapter_name="db", data={"name": "X"}, confidence=0.9, relevance_score=0.9),
            AdapterResult(adapter_name="pubmed", data={"name": "X"}, confidence=0.8, relevance_score=0.8),
        ]
        summary = synth.generate_summary(results)
        self.assertTrue(len(summary) > 0)
        self.assertTrue("2 source" in summary or "sources" in summary)

    async def test_format_citations(self) -> None:
        synth = ResponseSynthesizer()
        sources = [
            Source(source_name="PubMed", title="Study on SSRIs", confidence=0.9),
            Source(source_name="DrugBank", title="Sertraline Profile", confidence=0.95),
        ]
        citations = synth.format_citations(sources)
        self.assertEqual(len(citations), 2)
        self.assertEqual(citations[0].number, 1)
        self.assertEqual(citations[1].number, 2)

    async def test_caution_flags(self) -> None:
        synth = ResponseSynthesizer()
        results = [
            AdapterResult(adapter_name="db", data={}, confidence=0.3, relevance_score=0.3),
        ]
        response = await synth.synthesize(results, "low confidence query")
        self.assertTrue(response.requires_caution)

    async def test_markdown_output(self) -> None:
        synth = ResponseSynthesizer()
        results = [
            AdapterResult(adapter_name="db", data={"name": "X"}, confidence=0.9, relevance_score=0.9),
        ]
        response = await synth.synthesize(results, "test")
        md = response.to_markdown()
        self.assertTrue("# Response:" in md)
        self.assertTrue("**Confidence:**" in md)

    async def test_ranking(self) -> None:
        synth = ResponseSynthesizer()
        results = [
            AdapterResult(adapter_name="low", data={}, confidence=0.3, relevance_score=0.3),
            AdapterResult(adapter_name="high", data={}, confidence=0.9, relevance_score=0.9),
            AdapterResult(adapter_name="mid", data={}, confidence=0.6, relevance_score=0.6),
        ]
        ranked = synth._rank_results(results)
        self.assertEqual(ranked[0].adapter_name, "high")
        self.assertEqual(ranked[-1].adapter_name, "low")

    async def test_visualization_hints(self) -> None:
        synth = ResponseSynthesizer()
        results = [
            AdapterResult(adapter_name="db", data={"name": "A"}, confidence=0.9, entity_type="drug"),
            AdapterResult(adapter_name="db", data={"name": "B"}, confidence=0.8, entity_type="drug"),
        ]
        response = await synth.synthesize(results, "compare drugs")
        self.assertTrue(len(response.visualization_hints) > 0)

    async def test_grade_calculation(self) -> None:
        synth = ResponseSynthesizer()
        self.assertEqual(synth._grade(0.95), "A+")
        self.assertEqual(synth._grade(0.85), "A")
        self.assertEqual(synth._grade(0.75), "B")
        self.assertEqual(synth._grade(0.55), "C")
        self.assertEqual(synth._grade(0.35), "D")
        self.assertEqual(synth._grade(0.15), "F")


if __name__ == "__main__":
    unittest.main(module=__name__, exit=False, verbosity=2)
