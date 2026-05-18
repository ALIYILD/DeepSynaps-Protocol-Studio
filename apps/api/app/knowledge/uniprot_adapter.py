"""
UniProt Adapter — UniProt REST API
Provides access to 250M+ protein sequences, annotations, GO terms,
and functional information from the UniProt Knowledgebase.

API Docs: https://rest.uniprot.org/docs/
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
import httpx
import logging
import asyncio

logger = logging.getLogger(__name__)


class UniprotAdapter:
    """
    Adapter for the UniProt REST API.
    Comprehensive protein sequence and annotation database
    combining Swiss-Prot (curated) and TrEMBL (computed) entries.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.name = "uniprot"
        self.display_name = "UniProt"
        self.source_url = "https://rest.uniprot.org/"
        self.version = "2024_04"
        self.confidence_tier = "A"
        self.data_types = ["protein", "sequence", "function", "structure", "pathway", "variant"]
        self.rate_limit_per_minute = 60
        self.requires_auth = False
        self.auth_type = "none"
        self.api_key = api_key
        self._min_interval = 1.0  # 1 req/s default, be polite
        self._last_request_time = 0.0
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "DeepSynaps-Protocol-Studio/1.0 (UniProt-Adapter)",
                "Accept": "application/json",
            },
        )

    async def _throttled_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Execute HTTP request with rate limiting."""
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            await asyncio.sleep(self._min_interval - elapsed)
        response = await self.client.request(method, url, **kwargs)
        self._last_request_time = asyncio.get_event_loop().time()
        return response

    async def validate_connection(self) -> bool:
        """Validate connectivity to UniProt REST API."""
        try:
            response = await self._throttled_request(
                "GET",
                self.source_url + "uniprotkb/search",
                params={"query": "reviewed:true", "size": 1, "format": "json"},
            )
            if response.status_code == 200:
                data = response.json()
                if "results" in data:
                    logger.info(f"{self.name}: connection validated")
                    return True
            logger.warning(f"{self.name}: unexpected status {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"{self.name} connection failed: {e}")
            return False

    async def search(
        self, query: str, filters: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search UniProt by protein name, gene symbol, accession, or GO term.

        Parameters:
            query: Search term (protein name, gene symbol, UniProt ID, GO term)
            filters: Optional dict with keys:
                - 'search_type': 'protein' | 'gene' | 'accession' | 'go'
                - 'reviewed_only': bool (default False) — Swiss-Prot only
                - 'organism': str (default 'human')
                - 'size': int (result page size, max 25)
                - 'fields': List[str] — fields to return

        Returns:
            List of protein entry dicts.
        """
        filters = filters or {}
        search_type = filters.get("search_type", "auto")
        reviewed_only = filters.get("reviewed_only", False)
        size = min(int(filters.get("size", 25)), 25)
        fields = filters.get("fields", [])

        # Auto-detect search type
        if search_type == "auto":
            if query.startswith("P") or query.startswith("Q") or query.startswith("O"):
                if len(query) <= 10:
                    search_type = "accession"
                else:
                    search_type = "protein"
            elif query.startswith("GO:"):
                search_type = "go"
            else:
                search_type = "protein"

        try:
            if search_type == "protein":
                return await self._search_protein(query, reviewed_only, size, fields, filters)
            elif search_type == "gene":
                return await self._search_by_gene(query, reviewed_only, size, fields, filters)
            elif search_type == "accession":
                return await self._search_by_accession(query, fields, filters)
            elif search_type == "go":
                return await self._search_by_go(query, reviewed_only, size, fields, filters)
            else:
                return await self._search_protein(query, reviewed_only, size, fields, filters)

        except httpx.HTTPError as e:
            logger.error(f"{self.name} HTTP error during search: {e}")
            return []
        except Exception as e:
            logger.error(f"{self.name} search error: {e}")
            return []

    async def _search_protein(
        self, query: str, reviewed_only: bool, size: int, fields: List[str], filters: Dict
    ) -> List[Dict]:
        """Search proteins by name/keyword."""
        organism = filters.get("organism", "human")
        q_parts = [f"({query})"]
        if reviewed_only:
            q_parts.append("reviewed:true")
        if organism:
            q_parts.append(f"organism_name:{organism}")

        search_query = " AND ".join(q_parts)
        params = {
            "query": search_query,
            "size": size,
            "format": "json",
        }
        if fields:
            params["fields"] = ",".join(fields)

        response = await self._throttled_request(
            "GET", self.source_url + "uniprotkb/search", params=params
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        for r in results:
            r["_query_type"] = "protein"
            r["_query"] = query
        return results

    async def _search_by_gene(
        self, gene: str, reviewed_only: bool, size: int, fields: List[str], filters: Dict
    ) -> List[Dict]:
        """Search proteins by gene symbol."""
        organism = filters.get("organism", "human")
        q_parts = [f"(gene:{gene})"]
        if reviewed_only:
            q_parts.append("reviewed:true")
        if organism:
            q_parts.append(f"organism_name:{organism}")

        search_query = " AND ".join(q_parts)
        params = {
            "query": search_query,
            "size": size,
            "format": "json",
        }
        if fields:
            params["fields"] = ",".join(fields)

        response = await self._throttled_request(
            "GET", self.source_url + "uniprotkb/search", params=params
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        for r in results:
            r["_query_type"] = "gene"
            r["_query"] = gene
        return results

    async def _search_by_accession(
        self, accession: str, fields: List[str], _filters: Dict
    ) -> List[Dict]:
        """Fetch protein by UniProt accession."""
        url = f"{self.source_url}uniprotkb/{accession}"
        params = {"format": "json"}
        if fields:
            params["fields"] = ",".join(fields)

        response = await self._throttled_request("GET", url, params=params)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        data = response.json()
        data["_query_type"] = "accession"
        data["_query"] = accession
        return [data]

    async def _search_by_go(
        self, go_term: str, reviewed_only: bool, size: int, fields: List[str], filters: Dict
    ) -> List[Dict]:
        """Search proteins by GO term."""
        organism = filters.get("organism", "human")
        q_parts = [f"(go:{go_term})"]
        if reviewed_only:
            q_parts.append("reviewed:true")
        if organism:
            q_parts.append(f"organism_name:{organism}")

        search_query = " AND ".join(q_parts)
        params = {
            "query": search_query,
            "size": size,
            "format": "json",
        }
        if fields:
            params["fields"] = ",".join(fields)

        response = await self._throttled_request(
            "GET", self.source_url + "uniprotkb/search", params=params
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        for r in results:
            r["_query_type"] = "go"
            r["_query"] = go_term
        return results

    def transform_to_canonical(
        self, raw_data: Dict, entity_type: str = "protein"
    ) -> Dict:
        """
        Transform UniProt entry to canonical format.

        Parameters:
            raw_data: Raw dict from UniProt API
            entity_type: Target canonical entity type

        Returns:
            Canonical-format dict.
        """
        # Primary accession and ID
        accessions = raw_data.get("primaryAccession", "")
        uniProt_id = raw_data.get("uniProtkbId", "")

        # Entry type (reviewed = Swiss-Prot)
        entry_type = raw_data.get("entryType", "")
        is_reviewed = entry_type == "UniProtKB/Swiss-Prot"

        # Protein description
        protein_info = raw_data.get("proteinDescription", {})
        recommended_name = protein_info.get("recommendedName", {})
        protein_name = recommended_name.get("fullName", {}).get("value", "")
        if not protein_name:
            # Try submission names
            submission_names = protein_info.get("submissionNames", [])
            if submission_names:
                protein_name = submission_names[0].get("fullName", {}).get("value", "")
        # Try alternative names
        alternative_names = recommended_name.get("shortNames", [])
        alt_names = [n.get("value", "") for n in alternative_names]

        # Genes
        genes = raw_data.get("genes", [])
        gene_symbol = ""
        gene_names = []
        if genes and isinstance(genes, list):
            for gene in genes:
                gene_name = gene.get("geneName", {})
                name_val = gene_name.get("value", "")
                if name_val:
                    gene_names.append(name_val)
                    if not gene_symbol:
                        gene_symbol = name_val
                # Synonyms
                for syn in gene.get("synonyms", []):
                    syn_val = syn.get("value", "")
                    if syn_val:
                        gene_names.append(syn_val)

        # Organism
        organism = raw_data.get("organism", {})
        organism_name = organism.get("scientificName", "")
        taxon_id = organism.get("taxonId", None)

        # Sequence
        sequence_data = raw_data.get("sequence", {})
        sequence = sequence_data.get("sequence", "")
        seq_length = sequence_data.get("length", 0)
        seq_mol_weight = sequence_data.get("molWeight", None)

        # Comments (function, pathway, etc.)
        comments = raw_data.get("comments", [])
        function_comments = [
            c for c in comments
            if isinstance(c, dict) and c.get("commentType") == "FUNCTION"
        ]
        function_texts = []
        for fc in function_comments:
            texts = fc.get("texts", [])
            for t in texts:
                val = t.get("value", "") if isinstance(t, dict) else str(t)
                if val:
                    function_texts.append(val)

        # Keywords
        keywords = raw_data.get("keywords", [])
        keyword_names = [k.get("name", "") for k in keywords if isinstance(k, dict)]

        # Gene Ontology
        uniProt_knowledgebase = raw_data.get("uniProtKBCrossReferences", [])
        go_terms = []
        for ref in uniProt_knowledgebase:
            if isinstance(ref, dict) and ref.get("database") == "GO":
                go_id = ref.get("id", "")
                go_properties = ref.get("properties", [])
                go_term = ""
                for prop in go_properties:
                    if isinstance(prop, dict) and prop.get("key") == "GoTerm":
                        go_term = prop.get("value", "")
                go_terms.append({"id": go_id, "term": go_term})

        # Features (variants, domains, etc.)
        features = raw_data.get("features", [])
        variant_features = [
            f for f in features
            if isinstance(f, dict) and f.get("type") == "Natural variant"
        ]

        # Entry audit (dates)
        entry_audit = raw_data.get("entryAudit", {})
        first_public = entry_audit.get("firstPublicDate", "")
        last_modified = entry_audit.get("lastAnnotationUpdateDate", "")

        return {
            "entity_type": entity_type,
            "source_database": self.name,
            "source_id": accessions,
            "gene_symbol": gene_symbol,
            "variant_id": "",
            "chromosome": "",
            "position": None,
            "confidence": self.get_confidence_score(raw_data),
            "provenance": self.get_provenance(raw_data),
            "raw_data": raw_data,
            # UniProt-specific extensions
            "uniprot": {
                "accession": accessions,
                "uniprot_id": uniProt_id,
                "entry_type": entry_type,
                "is_reviewed": is_reviewed,
                "protein_name": protein_name,
                "alternative_names": alt_names,
                "gene_names": gene_names,
                "gene_symbol": gene_symbol,
                "organism": organism_name,
                "taxon_id": taxon_id,
                "sequence_length": seq_length,
                "sequence_molecular_weight": seq_mol_weight,
                "sequence": sequence[:100] if sequence else "",  # Truncated
                "function_descriptions": function_texts,
                "keywords": keyword_names,
                "go_terms": go_terms,
                "variant_count": len(variant_features),
                "first_public": first_public,
                "last_modified": last_modified,
            },
        }

    def get_provenance(self, result: Dict) -> Dict:
        """Return provenance metadata for UniProt result."""
        entry_type = result.get("entryType", "")
        is_reviewed = entry_type == "UniProtKB/Swiss-Prot"

        return {
            "source_database": self.name,
            "source_version": self.version,
            "source_url": self.source_url,
            "retrieved_at": datetime.utcnow().isoformat(),
            "confidence_tier": self.confidence_tier,
            "data_quality_score": 0.98 if is_reviewed else 0.75,
            "research_only": False,
            "curation_level": "manual_expert" if is_reviewed else "computational",
            "entry_type": entry_type,
            "license": "CC BY 4.0 (for data)",
        }

    def get_confidence_score(self, result: Dict) -> Dict:
        """
        Calculate confidence scores for a UniProt entry.
        Swiss-Prot (reviewed) entries have much higher confidence.
        """
        entry_type = result.get("entryType", "")
        is_reviewed = entry_type == "UniProtKB/Swiss-Prot"

        # Curation level
        if is_reviewed:
            curation = 0.99
            evidence = 0.95
        else:
            curation = 0.7
            evidence = 0.6

        # Has function annotation
        comments = result.get("comments", [])
        has_function = any(
            isinstance(c, dict) and c.get("commentType") == "FUNCTION"
            for c in comments
        )
        func_score = 0.9 if has_function else 0.5

        # Has GO terms
        xrefs = result.get("uniProtKBCrossReferences", [])
        has_go = any(
            isinstance(x, dict) and x.get("database") == "GO"
            for x in xrefs
        )
        go_score = 0.9 if has_go else 0.5

        # Has structural data
        has_pdb = any(
            isinstance(x, dict) and x.get("database") == "PDB"
            for x in xrefs
        )
        struct_score = 0.9 if has_pdb else 0.5

        overall = round(
            (curation * 0.40 + evidence * 0.20 + func_score * 0.15 +
             go_score * 0.10 + struct_score * 0.10 + 0.05),
            3,
        )

        return {
            "data_quality": curation,
            "evidence_strength": evidence,
            "sample_size": 0.85,
            "replication": 0.8 if is_reviewed else 0.5,
            "consistency": 0.92,
            "temporal_relevance": 0.88,
            "population_match": 0.7,
            "overall": overall,
        }

    async def get_protein_features(
        self, accession: str
    ) -> List[Dict]:
        """Fetch protein features (domains, variants, PTMs) for an entry."""
        try:
            url = f"{self.source_url}uniprotkb/{accession}"
            response = await self._throttled_request(
                "GET", url, params={"format": "json"}
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            data = response.json()
            return data.get("features", [])
        except Exception as e:
            logger.error(f"Error fetching features for {accession}: {e}")
            return []

    async def get_isoforms(
        self, accession: str
    ) -> List[Dict]:
        """Fetch isoform sequences for a protein entry."""
        try:
            url = f"{self.source_url}uniprotkb/{accession}"
            response = await self._throttled_request(
                "GET", url, params={"format": "json"}
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            data = response.json()

            # Extract isoform info from comments
            comments = data.get("comments", [])
            isoform_comments = [
                c for c in comments
                if isinstance(c, dict) and c.get("commentType") == "ALTERNATIVE PRODUCTS"
            ]
            isoforms = []
            for ic in isoform_comments:
                isoform_list = ic.get("isoforms", [])
                for iso in isoform_list:
                    isoforms.append({
                        "name": iso.get("name", ""),
                        "isoform_ids": iso.get("isoformIds", []),
                        "sequence_ids": iso.get("sequenceIds", []),
                        "is_canonical": iso.get("isCanonical", False),
                    })
            return isoforms
        except Exception as e:
            logger.error(f"Error fetching isoforms for {accession}: {e}")
            return []

    async def get_interactions(
        self, accession: str
    ) -> List[Dict]:
        """Fetch protein-protein interactions for an entry."""
        try:
            url = f"{self.source_url}uniprotkb/{accession}"
            response = await self._throttled_request(
                "GET", url, params={"format": "json"}
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            data = response.json()

            # Extract interaction info from comments
            comments = data.get("comments", [])
            interaction_comments = [
                c for c in comments
                if isinstance(c, dict) and c.get("commentType") == "INTERACTION"
            ]
            interactions = []
            for ic in interaction_comments:
                interactants = ic.get("interactions", [])
                for inter in interactants:
                    interactions.append({
                        "interactant1": inter.get("interactantOne", {}).get("uniProtKBAccession", ""),
                        "interactant2": inter.get("interactantTwo", {}).get("uniProtKBAccession", ""),
                        "gene_name": inter.get("interactantTwo", {}).get("geneName", ""),
                        "experiments": inter.get("numberOfExperiments", 0),
                    })
            return interactions
        except Exception as e:
            logger.error(f"Error fetching interactions for {accession}: {e}")
            return []

    async def id_mapping(
        self, ids: List[str], from_db: str = "UniProtKB_AC-ID", to_db: str = "GeneID"
    ) -> List[Dict]:
        """
        Map IDs between databases using UniProt's ID mapping service.

        Parameters:
            ids: List of IDs to map
            from_db: Source database (default UniProtKB accession)
            to_db: Target database (default GeneID/Entrez)

        Returns:
            List of mapping result dicts.
        """
        try:
            # Submit job
            submit_response = await self._throttled_request(
                "POST",
                self.source_url + "idmapping/run",
                data={"from": from_db, "to": to_db, "ids": ",".join(ids)},
            )
            submit_response.raise_for_status()
            job_data = submit_response.json()
            job_id = job_data.get("jobId")

            if not job_id:
                return []

            # Poll for results (simplified - just one try)
            await asyncio.sleep(2)
            result_response = await self._throttled_request(
                "GET",
                self.source_url + f"idmapping/results/{job_id}",
                params={"format": "json"},
            )
            result_response.raise_for_status()
            result_data = result_response.json()
            return result_data.get("results", [])

        except Exception as e:
            logger.error(f"ID mapping error: {e}")
            return []

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()
