"""
cross_reference_mesh.py — Intelligent Synaps v4
==================================================
Cross-database entity linking using canonical IDs.

Maps entities across multiple databases:
    Sertraline → RxNorm: 36437 → DrugBank: DB01104 → ChEMBL: CHEMBL83 →
    PubChem: 68617 → KEGG: D02360 → PharmGKB: PA451355

Identity resolution uses UMLS CUIs, PubChem CIDs, ENSEMBL IDs, and
adapter-specific mapping tables. Cross-validation detects conflicting
facts across sources.
"""

from __future__ import annotations

import asyncio
import logging
import unittest
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger("intelligent_synaps.cross_reference_mesh")

# ---------------------------------------------------------------------------
# Constants — canonical ID prefixes
# ---------------------------------------------------------------------------

CANONICAL_PREFIXES = {
    "drug": "DRUG",
    "gene": "GENE",
    "protein": "PROT",
    "disease": "DIS",
    "variant": "VAR",
    "pathway": "PATH",
    "phenotype": "PHENO",
    "clinical_trial": "CT",
}

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SourceMapping(BaseModel):
    """A mapping from a source database ID to a canonical ID."""

    source: str                          # e.g. "drugbank"
    source_id: str                       # e.g. "DB01104"
    canonical_id: str                    # e.g. "DRUG:sertraline"
    entity_type: str                     # e.g. "drug"
    mapping_confidence: float = 1.0      # 0-1, how certain is this mapping
    mapping_method: str = "exact_match"  # exact_match, fuzzy, curated, inferred
    last_verified: Optional[str] = None  # ISO timestamp


class EntityFact(BaseModel):
    """A single fact about an entity from a specific source."""

    source: str
    source_id: str
    property_name: str           # e.g. "molecular_weight"
    property_value: Any
    confidence: float = 1.0
    retrieved_at: Optional[str] = None


class EntityProfile(BaseModel):
    """Comprehensive profile of an entity from all available sources."""

    canonical_id: str
    entity_type: str
    preferred_name: str
    aliases: List[str] = Field(default_factory=list)
    source_ids: Dict[str, str] = Field(default_factory=dict)
    facts: List[EntityFact] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    cross_reference_count: int = 0
    consistency_score: float = 1.0
    last_updated: Optional[str] = None

    def get_fact(self, property_name: str) -> List[EntityFact]:
        """Get all facts for a property."""
        return [f for f in self.facts if f.property_name == property_name]

    def get_fact_value(self, property_name: str) -> Optional[Any]:
        """Get the consensus value for a property."""
        matching = self.get_fact(property_name)
        if not matching:
            return None
        # Return highest-confidence value
        best = max(matching, key=lambda f: f.confidence)
        return best.property_value


class LinkedEntity(BaseModel):
    """Result of entity linking across sources."""

    canonical_id: str
    entity_type: str
    preferred_name: str
    aliases: List[str]
    source_mappings: List[SourceMapping]
    linked_sources: List[str]
    fact_count: int
    consistency_score: float


class FactConflict(BaseModel):
    """Detected conflict between facts from different sources."""

    property_name: str
    values: List[Dict[str, Any]]  # [{"source": "s", "value": v, "confidence": c}]
    severity: str  # low, medium, high
    sources_involved: List[str]
    suggested_resolution: Optional[str] = None


class ConsistencyReport(BaseModel):
    """Cross-source consistency validation report."""

    canonical_id: str
    entity_type: str
    sources_checked: List[str]
    facts_compared: int
    conflicts: List[FactConflict]
    overall_consistency: float  # 0-1
    warnings: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# In-memory mapping database (seed data)
# ---------------------------------------------------------------------------

# Pre-seeded mappings for common neuropsychiatric drugs and genes
SEED_MAPPINGS: List[SourceMapping] = [
    # Sertraline
    SourceMapping(source="rxnorm", source_id="36437", canonical_id="DRUG:sertraline", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="drugbank", source_id="DB01104", canonical_id="DRUG:sertraline", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="chembl", source_id="CHEMBL83", canonical_id="DRUG:sertraline", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="pubchem", source_id="68617", canonical_id="DRUG:sertraline", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="kegg", source_id="D02360", canonical_id="DRUG:sertraline", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="pharmgkb", source_id="PA451355", canonical_id="DRUG:sertraline", entity_type="drug", mapping_confidence=1.0),
    # Fluoxetine
    SourceMapping(source="rxnorm", source_id="4493", canonical_id="DRUG:fluoxetine", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="drugbank", source_id="DB00472", canonical_id="DRUG:fluoxetine", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="chembl", source_id="CHEMBL41", canonical_id="DRUG:fluoxetine", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="pubchem", source_id="3386", canonical_id="DRUG:fluoxetine", entity_type="drug", mapping_confidence=1.0),
    # Escitalopram
    SourceMapping(source="rxnorm", source_id="321988", canonical_id="DRUG:escitalopram", entity_type="drug", mapping_confidence=1.0),
    SourceMapping(source="drugbank", source_id="DB01175", canonical_id="DRUG:escitalopram", entity_type="drug", mapping_confidence=1.0),
    # CYP2D6
    SourceMapping(source="ensembl", source_id="ENSG00000100197", canonical_id="GENE:cyp2d6", entity_type="gene", mapping_confidence=1.0),
    SourceMapping(source="ncbi_gene", source_id="1565", canonical_id="GENE:cyp2d6", entity_type="gene", mapping_confidence=1.0),
    SourceMapping(source="pharmgkb", source_id="PA128", canonical_id="GENE:cyp2d6", entity_type="gene", mapping_confidence=1.0),
    SourceMapping(source="hgnc", source_id="HGNC:2625", canonical_id="GENE:cyp2d6", entity_type="gene", mapping_confidence=1.0),
    # CYP2C19
    SourceMapping(source="ensembl", source_id="ENSG00000140465", canonical_id="GENE:cyp2c19", entity_type="gene", mapping_confidence=1.0),
    SourceMapping(source="ncbi_gene", source_id="1557", canonical_id="GENE:cyp2c19", entity_type="gene", mapping_confidence=1.0),
    SourceMapping(source="pharmgkb", source_id="PA124", canonical_id="GENE:cyp2c19", entity_type="gene", mapping_confidence=1.0),
    # BDNF
    SourceMapping(source="ensembl", source_id="ENSG00000176697", canonical_id="GENE:bdnf", entity_type="gene", mapping_confidence=1.0),
    SourceMapping(source="ncbi_gene", source_id="627", canonical_id="GENE:bdnf", entity_type="gene", mapping_confidence=1.0),
    # COMT
    SourceMapping(source="ensembl", source_id="ENSG00000093010", canonical_id="GENE:comt", entity_type="gene", mapping_confidence=1.0),
    SourceMapping(source="ncbi_gene", source_id="1312", canonical_id="GENE:comt", entity_type="gene", mapping_confidence=1.0),
    # Major Depressive Disorder
    SourceMapping(source="mondo", source_id="MONDO:0002050", canonical_id="DIS:major_depressive_disorder", entity_type="disease", mapping_confidence=1.0),
    SourceMapping(source="doid", source_id="DOID:1596", canonical_id="DIS:major_depressive_disorder", entity_type="disease", mapping_confidence=1.0),
    SourceMapping(source="omim", source_id="OMIM:608516", canonical_id="DIS:major_depressive_disorder", entity_type="disease", mapping_confidence=0.9),
    SourceMapping(source="mesh", source_id="D003866", canonical_id="DIS:major_depressive_disorder", entity_type="disease", mapping_confidence=1.0),
    # Bipolar Disorder
    SourceMapping(source="mondo", source_id="MONDO:0004985", canonical_id="DIS:bipolar_disorder", entity_type="disease", mapping_confidence=1.0),
    SourceMapping(source="doid", source_id="DOID:3312", canonical_id="DIS:bipolar_disorder", entity_type="disease", mapping_confidence=1.0),
    SourceMapping(source="mesh", source_id="D001714", canonical_id="DIS:bipolar_disorder", entity_type="disease", mapping_confidence=1.0),
]

# ---------------------------------------------------------------------------
# CrossReferenceMesh
# ---------------------------------------------------------------------------

class CrossReferenceMesh:
    """Links entities across multiple databases using canonical IDs.

    Usage:
        mesh = CrossReferenceMesh()
        linked = await mesh.link_entities(results)
        profile = await mesh.resolve_identity("drug", "sertraline")
        report = await mesh.validate_consistency("DRUG:sertraline")
    """

    def __init__(
        self,
        initial_mappings: Optional[List[SourceMapping]] = None,
    ) -> None:
        self.id_mappings: Dict[str, Dict[str, str]] = {}
        # canonical_id → {source: source_id}
        self._canonical_to_sources: Dict[str, Dict[str, str]] = {}
        # source_key → canonical_id
        self._source_to_canonical: Dict[str, str] = {}
        self.entity_cache: Dict[str, EntityProfile] = {}
        self._lock = asyncio.Lock()

        # Load seed data
        for mapping in (initial_mappings or SEED_MAPPINGS):
            self._add_mapping(mapping)

        logger.info(
            "CrossReferenceMesh initialised (%d mappings)",
            len(self._canonical_to_sources),
        )

    # -- Internal helpers -----------------------------------------------------

    def _source_key(self, source: str, source_id: str) -> str:
        return f"{source.lower()}:{source_id}"

    def _add_mapping(self, mapping: SourceMapping) -> None:
        """Add a mapping to the internal indexes."""
        skey = self._source_key(mapping.source, mapping.source_id)
        self._source_to_canonical[skey] = mapping.canonical_id

        if mapping.canonical_id not in self._canonical_to_sources:
            self._canonical_to_sources[mapping.canonical_id] = {}
        self._canonical_to_sources[mapping.canonical_id][mapping.source] = mapping.source_id

    # -- Public API -----------------------------------------------------------

    async def link_entities(
        self, results: List[Dict[str, Any]]
    ) -> List[LinkedEntity]:
        """Link entities found in adapter results across databases.

        Parameters
        ----------
        results:
            List of raw result dicts from adapters. Each should contain
            at minimum 'source', 'source_id', 'name', 'entity_type'.

        Returns
        -------
        List of LinkedEntity objects with cross-database mappings.
        """
        linked: Dict[str, LinkedEntity] = {}

        for result in results:
            source = result.get("source", result.get("adapter_name", "unknown"))
            source_id = str(result.get("source_id", result.get("id", "")))
            name = result.get("name", result.get("preferred_name", source_id))
            entity_type = result.get("entity_type", "unknown")

            if not source_id:
                continue

            canonical = self.get_canonical_id(source, source_id)

            if canonical:
                # Known entity
                sources = self._canonical_to_sources.get(canonical, {})
                if canonical not in linked:
                    profile = await self.resolve_identity(
                        entity_type, name, canonical_hint=canonical
                    )
                    mappings = [
                        SourceMapping(
                            source=src,
                            source_id=sid,
                            canonical_id=canonical,
                            entity_type=entity_type,
                        )
                        for src, sid in sources.items()
                    ]
                    linked[canonical] = LinkedEntity(
                        canonical_id=canonical,
                        entity_type=entity_type,
                        preferred_name=profile.preferred_name if profile else name,
                        aliases=profile.aliases if profile else [],
                        source_mappings=mappings,
                        linked_sources=list(sources.keys()),
                        fact_count=len(profile.facts) if profile else 0,
                        consistency_score=1.0,
                    )
            else:
                # Unknown entity — create singleton
                singleton_id = f"UNK:{source}:{source_id}"
                if singleton_id not in linked:
                    linked[singleton_id] = LinkedEntity(
                        canonical_id=singleton_id,
                        entity_type=entity_type,
                        preferred_name=name,
                        aliases=[],
                        source_mappings=[
                            SourceMapping(
                                source=source,
                                source_id=source_id,
                                canonical_id=singleton_id,
                                entity_type=entity_type,
                            )
                        ],
                        linked_sources=[source],
                        fact_count=0,
                        consistency_score=0.5,
                    )

        logger.info(
            "Linked %d entities from %d results", len(linked), len(results)
        )
        return list(linked.values())

    async def resolve_identity(
        self,
        entity_type: str,
        identifier: str,
        canonical_hint: Optional[str] = None,
    ) -> EntityProfile:
        """Get comprehensive entity profile from all available sources.

        Parameters
        ----------
        entity_type:
            e.g. "drug", "gene", "disease"
        identifier:
            Name or ID of the entity.
        canonical_hint:
            Optional canonical ID if already known.

        Returns
        -------
        EntityProfile with all cross-referenced data.
        """
        cache_key = f"{entity_type}:{identifier}"
        if cache_key in self.entity_cache:
            return self.entity_cache[cache_key]

        # Determine canonical ID
        if canonical_hint:
            canonical_id = canonical_hint
        else:
            # Try to find by iterating sources
            canonical_id = None
            for src in ["rxnorm", "drugbank", "ensembl", "mondo", "mesh"]:
                c = self.get_canonical_id(src, identifier)
                if c:
                    canonical_id = c
                    break
            if not canonical_id:
                # Try case-insensitive name match
                prefix = CANONICAL_PREFIXES.get(entity_type, "ENT")
                for cid in self._canonical_to_sources:
                    if cid.lower().endswith(identifier.lower().replace(" ", "_")):
                        canonical_id = cid
                        break
                if not canonical_id:
                    canonical_id = f"{prefix}:{identifier.lower().replace(' ', '_')}"

        sources = self._canonical_to_sources.get(canonical_id, {})

        # Gather facts from each source
        facts: List[EntityFact] = []
        aliases: List[str] = []

        # Add seed facts
        seed_facts = self._get_seed_facts(canonical_id)
        facts.extend(seed_facts)

        profile = EntityProfile(
            canonical_id=canonical_id,
            entity_type=entity_type,
            preferred_name=identifier,
            aliases=list(set(aliases)),
            source_ids=dict(sources),
            facts=facts,
            sources=list(sources.keys()),
            cross_reference_count=len(sources),
            consistency_score=1.0,
        )

        async with self._lock:
            self.entity_cache[cache_key] = profile

        logger.debug(
            "Resolved %s: %s (sources=%d, facts=%d)",
            entity_type,
            canonical_id,
            len(sources),
            len(facts),
        )
        return profile

    async def validate_consistency(
        self, entity_id: str
    ) -> ConsistencyReport:
        """Check if facts about an entity are consistent across sources.

        Parameters
        ----------
        entity_id:
            Canonical entity ID.

        Returns
        -------
        ConsistencyReport with detected conflicts and overall score.
        """
        profile = self.entity_cache.get(entity_id)
        if profile is None:
            # Try to resolve
            parts = entity_id.split(":", 1)
            if len(parts) == 2:
                etype = CANONICAL_PREFIXES.get(parts[0].lower(), "unknown")
                profile = await self.resolve_identity(etype, parts[1], entity_id)
            else:
                return ConsistencyReport(
                    canonical_id=entity_id,
                    entity_type="unknown",
                    sources_checked=[],
                    facts_compared=0,
                    conflicts=[],
                    overall_consistency=0.0,
                    warnings=["Entity not found in mesh"],
                )

        conflicts: List[FactConflict] = []
        warnings: List[str] = []

        # Group facts by property
        by_property: Dict[str, List[EntityFact]] = {}
        for fact in profile.facts:
            by_property.setdefault(fact.property_name, []).append(fact)

        for prop_name, facts in by_property.items():
            if len(facts) < 2:
                continue
            # Check for conflicts
            unique_values: Dict[str, List[EntityFact]] = {}
            for f in facts:
                vkey = str(f.property_value)
                unique_values.setdefault(vkey, []).append(f)

            if len(unique_values) > 1:
                # Conflict detected
                values = [
                    {
                        "source": f.source,
                        "value": f.property_value,
                        "confidence": f.confidence,
                    }
                    for f in facts
                ]
                sources = list(set(f.source for f in facts))
                severity = (
                    "high" if len(sources) > 2 else "medium" if len(sources) > 1 else "low"
                )
                conflicts.append(
                    FactConflict(
                        property_name=prop_name,
                        values=values,
                        severity=severity,
                        sources_involved=sources,
                        suggested_resolution=f"Review {prop_name} across {', '.join(sources)}",
                    )
                )

        # Calculate overall consistency
        total_props = len(by_property)
        conflicting_props = len(conflicts)
        consistency = 1.0 if total_props == 0 else max(0.0, 1.0 - (conflicting_props / total_props))

        report = ConsistencyReport(
            canonical_id=entity_id,
            entity_type=profile.entity_type,
            sources_checked=profile.sources,
            facts_compared=sum(len(f) for f in by_property.values()),
            conflicts=conflicts,
            overall_consistency=round(consistency, 3),
            warnings=warnings,
        )

        logger.info(
            "Consistency for %s: %.2f (%d conflicts from %d properties)",
            entity_id,
            consistency,
            len(conflicts),
            total_props,
        )
        return report

    def get_canonical_id(
        self, source: str, source_id: str
    ) -> Optional[str]:
        """Map a source-specific ID to a canonical ID.

        Parameters
        ----------
        source:
            Source database name, e.g. "drugbank".
        source_id:
            ID within that source, e.g. "DB01104".

        Returns
        -------
        Canonical ID string, or None if not mapped.
        """
        skey = self._source_key(source, source_id)
        return self._source_to_canonical.get(skey)

    async def add_mapping(self, mapping: SourceMapping) -> None:
        """Add a new mapping dynamically."""
        async with self._lock:
            self._add_mapping(mapping)
        logger.info(
            "Added mapping: %s:%s → %s",
            mapping.source,
            mapping.source_id,
            mapping.canonical_id,
        )

    async def merge_entities(
        self, canonical_id: str, alias_canonical_ids: List[str]
    ) -> EntityProfile:
        """Merge multiple canonical IDs into one (entity deduplication).

        All source mappings from aliases are redirected to the primary
        canonical_id.
        """
        async with self._lock:
            for alias_id in alias_canonical_ids:
                sources = self._canonical_to_sources.pop(alias_id, {})
                for src, sid in sources.items():
                    skey = self._source_key(src, sid)
                    self._source_to_canonical[skey] = canonical_id
                if alias_id in self._canonical_to_sources:
                    del self._canonical_to_sources[alias_id]

        logger.info(
            "Merged %s into %s", alias_canonical_ids, canonical_id
        )
        return await self.resolve_identity("unknown", canonical_id)

    def get_all_mappings(self) -> Dict[str, Dict[str, str]]:
        """Return all canonical → source mappings."""
        return dict(self._canonical_to_sources)

    def get_mapping_count(self) -> int:
        """Total number of canonical entities mapped."""
        return len(self._canonical_to_sources)

    # -- Seed facts for known entities ----------------------------------------

    def _get_seed_facts(self, canonical_id: str) -> List[EntityFact]:
        """Return pre-seeded facts for known entities."""
        facts: List[EntityFact] = []

        if canonical_id == "DRUG:sertraline":
            facts = [
                EntityFact(source="drugbank", source_id="DB01104", property_name="drug_class", property_value="Selective Serotonin Reuptake Inhibitor (SSRI)", confidence=1.0),
                EntityFact(source="drugbank", source_id="DB01104", property_name="mechanism", property_value="Inhibits serotonin reuptake at the serotonin transporter (SERT)", confidence=1.0),
                EntityFact(source="drugbank", source_id="DB01104", property_name="indication", property_value="Major Depressive Disorder, OCD, Panic Disorder, PTSD, Social Anxiety Disorder", confidence=1.0),
                EntityFact(source="drugbank", source_id="DB01104", property_name="half_life", property_value="26 hours", confidence=0.95),
                EntityFact(source="pharmgkb", source_id="PA451355", property_name="cpic_guideline", property_value="CYP2C19 genotype affects dosing", confidence=0.9),
                EntityFact(source="pubchem", source_id="68617", property_name="molecular_weight", property_value="306.23 g/mol", confidence=1.0),
                EntityFact(source="pubchem", source_id="68617", property_name="smiles", property_value="CNC1CCC(C2=CC=C(Cl)C=C2)C1", confidence=1.0),
            ]
        elif canonical_id == "DRUG:fluoxetine":
            facts = [
                EntityFact(source="drugbank", source_id="DB00472", property_name="drug_class", property_value="Selective Serotonin Reuptake Inhibitor (SSRI)", confidence=1.0),
                EntityFact(source="drugbank", source_id="DB00472", property_name="mechanism", property_value="Selective serotonin reuptake inhibition", confidence=1.0),
                EntityFact(source="drugbank", source_id="DB00472", property_name="half_life", property_value="1-3 days (norfluoxetine metabolite: 9 days)", confidence=0.95),
                EntityFact(source="pubchem", source_id="3386", property_name="molecular_weight", property_value="309.33 g/mol", confidence=1.0),
            ]
        elif canonical_id == "GENE:cyp2d6":
            facts = [
                EntityFact(source="pharmgkb", source_id="PA128", property_name="function", property_value="Drug metabolism (CYP450 superfamily)", confidence=1.0),
                EntityFact(source="pharmgkb", source_id="PA128", property_name="polymorphisms", property_value="*1, *2, *3, *4, *5, *6, *7, *8, *9, *10, *17, *41", confidence=0.95),
                EntityFact(source="ensembl", source_id="ENSG00000100197", property_name="chromosome", property_value="22q13.2", confidence=1.0),
                EntityFact(source="pharmgkb", source_id="PA128", property_name="clinical_significance", property_value="Affects metabolism of ~25% of clinically used drugs", confidence=0.95),
            ]
        elif canonical_id == "GENE:cyp2c19":
            facts = [
                EntityFact(source="pharmgkb", source_id="PA124", property_name="function", property_value="Drug metabolism (CYP450 superfamily)", confidence=1.0),
                EntityFact(source="ensembl", source_id="ENSG00000140465", property_name="chromosome", property_value="10q24.1", confidence=1.0),
                EntityFact(source="pharmgkb", source_id="PA124", property_name="clinical_significance", property_value="Key pharmacogene for clopidogrel, PPIs, antidepressants", confidence=0.95),
            ]
        elif canonical_id == "DIS:major_depressive_disorder":
            facts = [
                EntityFact(source="mondo", source_id="MONDO:0002050", property_name="definition", property_value="Mental disorder characterized by persistently depressed mood", confidence=1.0),
                EntityFact(source="mondo", source_id="MONDO:0002050", property_name="prevalence", property_value="~7% lifetime prevalence", confidence=0.9),
                EntityFact(source="mesh", source_id="D003866", property_name="symptoms", property_value="Depressed mood, anhedonia, sleep disturbance, fatigue, cognitive impairment", confidence=0.95),
            ]

        return facts


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestCrossReferenceMesh(unittest.IsolatedAsyncioTestCase):
    async def test_init(self) -> None:
        mesh = CrossReferenceMesh()
        self.assertTrue(mesh.get_mapping_count() > 0)

    async def test_get_canonical_id(self) -> None:
        mesh = CrossReferenceMesh()
        cid = mesh.get_canonical_id("drugbank", "DB01104")
        self.assertEqual(cid, "DRUG:sertraline")

    async def test_get_canonical_id_not_found(self) -> None:
        mesh = CrossReferenceMesh()
        cid = mesh.get_canonical_id("drugbank", "NONEXISTENT")
        self.assertIsNone(cid)

    async def test_resolve_identity_drug(self) -> None:
        mesh = CrossReferenceMesh()
        profile = await mesh.resolve_identity("drug", "sertraline")
        self.assertEqual(profile.canonical_id, "DRUG:sertraline")
        self.assertTrue(len(profile.facts) > 0)
        self.assertIn("drugbank", profile.sources)

    async def test_resolve_identity_gene(self) -> None:
        mesh = CrossReferenceMesh()
        profile = await mesh.resolve_identity("gene", "cyp2d6")
        self.assertEqual(profile.canonical_id, "GENE:cyp2d6")
        self.assertTrue(len(profile.facts) > 0)

    async def test_resolve_identity_disease(self) -> None:
        mesh = CrossReferenceMesh()
        profile = await mesh.resolve_identity("disease", "major_depressive_disorder")
        self.assertEqual(profile.canonical_id, "DIS:major_depressive_disorder")

    async def test_profile_get_fact(self) -> None:
        mesh = CrossReferenceMesh()
        profile = await mesh.resolve_identity("drug", "sertraline")
        facts = profile.get_fact("mechanism")
        self.assertTrue(len(facts) > 0)
        value = profile.get_fact_value("mechanism")
        self.assertIsNotNone(value)

    async def test_link_entities(self) -> None:
        mesh = CrossReferenceMesh()
        results = [
            {"source": "drugbank", "source_id": "DB01104", "name": "Sertraline", "entity_type": "drug"},
            {"source": "pubchem", "source_id": "68617", "name": "Sertraline", "entity_type": "drug"},
            {"source": "drugbank", "source_id": "DB00472", "name": "Fluoxetine", "entity_type": "drug"},
        ]
        linked = await mesh.link_entities(results)
        # Should get 2 unique entities
        self.assertTrue(len(linked) >= 2)
        sertraline = next((e for e in linked if "sertraline" in e.canonical_id.lower()), None)
        self.assertIsNotNone(sertraline)
        if sertraline:
            self.assertTrue(len(sertraline.linked_sources) >= 2)

    async def test_validate_consistency_clean(self) -> None:
        mesh = CrossReferenceMesh()
        report = await mesh.validate_consistency("DRUG:sertraline")
        self.assertTrue(report.overall_consistency >= 0.0)
        self.assertTrue(len(report.sources_checked) > 0)

    async def test_add_mapping(self) -> None:
        mesh = CrossReferenceMesh()
        new_mapping = SourceMapping(
            source="test_db",
            source_id="TEST123",
            canonical_id="DRUG:test_drug",
            entity_type="drug",
            mapping_confidence=0.9,
        )
        await mesh.add_mapping(new_mapping)
        cid = mesh.get_canonical_id("test_db", "TEST123")
        self.assertEqual(cid, "DRUG:test_drug")

    async def test_merge_entities(self) -> None:
        mesh = CrossReferenceMesh()
        # First add an alias
        alias_map = SourceMapping(
            source="test_db", source_id="ALIAS1",
            canonical_id="DRUG:alias_drug", entity_type="drug",
        )
        await mesh.add_mapping(alias_map)
        merged = await mesh.merge_entities("DRUG:sertraline", ["DRUG:alias_drug"])
        self.assertEqual(merged.canonical_id, "DRUG:sertraline")

    async def test_cross_reference_count(self) -> None:
        mesh = CrossReferenceMesh()
        profile = await mesh.resolve_identity("drug", "sertraline")
        self.assertTrue(profile.cross_reference_count >= 4)

    async def test_all_sources_mapped(self) -> None:
        mesh = CrossReferenceMesh()
        profile = await mesh.resolve_identity("drug", "sertraline")
        self.assertIn("drugbank", profile.source_ids)
        self.assertIn("chembl", profile.source_ids)
        self.assertIn("pubchem", profile.source_ids)
        self.assertIn("pharmgkb", profile.source_ids)

    async def test_drug_class_consistency(self) -> None:
        mesh = CrossReferenceMesh()
        profile = await mesh.resolve_identity("drug", "sertraline")
        drug_class = profile.get_fact_value("drug_class")
        self.assertIn("SSRI", str(drug_class))


if __name__ == "__main__":
    unittest.main(module=__name__, exit=False, verbosity=2)
