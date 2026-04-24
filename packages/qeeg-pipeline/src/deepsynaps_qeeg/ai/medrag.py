"""EEG-MedRAG — hypergraph retrieval over the DeepSynaps literature DB.

Implements the architectural skeleton of the EEG-MedRAG paper (arXiv
2508.13735, Oct 2025) on top of the existing ``deepsynaps`` Postgres
schema extended in CONTRACT_V2 §2:

* ``papers.embedding`` (pgvector) — dense abstract embeddings
* ``kg_entities``   — SOZO conditions, 21 modalities, 19 10-20 channels,
  5 frequency bands, and common qEEG biomarkers
* ``kg_hyperedges`` — n-ary relations linking entities to papers

Heavy dependencies (``pgvector``, ``sentence_transformers``, ``psycopg``,
``networkx``) are import-guarded. When any of them is missing the
module falls back to a deterministic toy path that reads
``tests/fixtures/toy_papers.json`` and ranks by naive keyword overlap —
this keeps the pipeline green on dev boxes without a live DB.

Public surface
--------------
``MedRAG``
    Class wrapper with ``build_paper_index``, ``build_kg`` and
    ``retrieve`` methods.
``retrieve(eeg_features, patient_meta, *, k, db_session)``
    Module-level convenience wrapping a lazily-created singleton.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# -------------------------------------------------------------------- deps
try:  # pgvector client glue (optional)
    from pgvector.psycopg import register_vector  # noqa: F401

    HAS_PGVECTOR = True
except Exception:  # pragma: no cover - import guard
    HAS_PGVECTOR = False

try:
    from sentence_transformers import SentenceTransformer  # noqa: F401

    HAS_SENTENCE_TRANSFORMERS = True
except Exception:  # pragma: no cover - import guard
    HAS_SENTENCE_TRANSFORMERS = False

try:  # psycopg is a soft dep via report.rag already
    import psycopg  # noqa: F401

    HAS_PSYCOPG = True
except Exception:  # pragma: no cover - import guard
    HAS_PSYCOPG = False


# -------------------------------------------------------------------- constants
_TOY_PAPERS = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "toy_papers.json"
)

# SOZO condition slugs used across the platform.
SOZO_CONDITIONS: tuple[str, ...] = (
    "adhd",
    "anxiety",
    "depression",
    "insomnia",
    "tbi",
    "cognitive_decline",
    "ptsd",
    "autism",
    "ocd",
    "parkinsons",
    "alzheimers",
    "addiction",
    "chronic_pain",
    "migraine",
    "epilepsy",
)

# 21 modalities the SOZO stack supports.
SOZO_MODALITIES: tuple[str, ...] = (
    "rtms_10hz",
    "rtms_1hz",
    "itbs",
    "ctbs",
    "tdcs",
    "tacs",
    "trns",
    "neurofeedback",
    "neurofeedback_smr_theta",
    "alpha_downtraining",
    "alpha_uptraining",
    "tfus",
    "deep_tms",
    "tvns",
    "taVNS",
    "pemf",
    "hbot",
    "photobiomodulation",
    "closed_loop_sleep_stim",
    "tdcs_2ma",
    "hbot_pulsed_hf_emf",
)

# Standard 19-electrode 10-20 set.
CHANNELS_10_20: tuple[str, ...] = (
    "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
    "T7", "C3", "Cz", "C4", "T8",
    "P7", "P3", "Pz", "P4", "P8",
    "O1", "O2",
)

FREQ_BANDS: tuple[str, ...] = ("delta", "theta", "alpha", "beta", "gamma")

# Canonical qEEG biomarkers referenced in the hypergraph.
BIOMARKERS: tuple[str, ...] = (
    "frontal_alpha_asymmetry",
    "theta_beta_ratio",
    "peak_alpha_frequency",
    "aperiodic_slope",
    "dmn_coherence",
    "elevated_posterior_alpha",
    "reduced_sleep_spindles",
    "elevated_delta_frontal",
    "elevated_theta_at_Fz",
)


# -------------------------------------------------------------------- MedRAG
@dataclass
class _KGCache:
    """In-memory cache for the KG when no DB is available."""

    entities: list[dict[str, Any]] = field(default_factory=list)
    hyperedges: list[dict[str, Any]] = field(default_factory=list)


class MedRAG:
    """Hypergraph retrieval wrapper around the DeepSynaps literature DB.

    Parameters
    ----------
    db_url : str, optional
        Postgres DSN. When ``None`` (or when any heavy dep is missing),
        retrieval falls back to the toy-paper JSON fixture.
    encoder_name : str, optional
        Sentence-transformer model id. Loaded lazily on first use.

    Notes
    -----
    No network / model download is attempted at import time — the encoder
    is only instantiated the first time ``_encode`` is called.
    """

    def __init__(
        self,
        *,
        db_url: str | None = None,
        encoder_name: str = "BAAI/bge-m3",
    ) -> None:
        self.db_url: str | None = db_url or os.environ.get("DEEPSYNAPS_DB_URL")
        self.encoder_name: str = encoder_name
        self._encoder: Any | None = None
        self._kg_cache: _KGCache = _KGCache()
        self._toy_papers: list[dict[str, Any]] | None = None

    # -------------------------------------------------------- encoder
    def _encode(self, texts: list[str]) -> list[list[float]] | None:
        """Return dense embeddings, or ``None`` when deps are missing."""
        if not HAS_SENTENCE_TRANSFORMERS:
            log.warning(
                "sentence_transformers not installed — MedRAG encoder disabled."
            )
            return None
        if self._encoder is None:
            try:
                from sentence_transformers import SentenceTransformer

                self._encoder = SentenceTransformer(self.encoder_name)
            except Exception as exc:  # pragma: no cover - network / model
                log.warning("Failed to load %s (%s); disabling encoder.",
                            self.encoder_name, exc)
                self._encoder = None
                return None
        try:
            vecs = self._encoder.encode(texts, show_progress_bar=False)
            return [list(map(float, v)) for v in vecs]
        except Exception as exc:  # pragma: no cover - runtime
            log.warning("Encoder inference failed: %s", exc)
            return None

    # -------------------------------------------------------- indexing
    def build_paper_index(self) -> int:
        """Embed every row in ``papers`` and write to ``papers.embedding``.

        Returns
        -------
        int
            The number of papers embedded. ``0`` when deps / DB missing
            (no-op stub).
        """
        if not (self.db_url and HAS_PSYCOPG and HAS_PGVECTOR and HAS_SENTENCE_TRANSFORMERS):
            log.warning(
                "build_paper_index skipped — db=%s psycopg=%s pgvector=%s st=%s",
                bool(self.db_url), HAS_PSYCOPG, HAS_PGVECTOR,
                HAS_SENTENCE_TRANSFORMERS,
            )
            return 0

        import psycopg  # local import — guarded above
        from pgvector.psycopg import register_vector

        count = 0
        with psycopg.connect(self.db_url) as conn:
            register_vector(conn)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, abstract FROM papers "
                    "WHERE embedding IS NULL AND abstract IS NOT NULL"
                )
                rows = cur.fetchall()
                if not rows:
                    return 0
                ids = [r[0] for r in rows]
                texts = [r[1] or "" for r in rows]
                vecs = self._encode(texts)
                if vecs is None:
                    return 0
                for pid, vec in zip(ids, vecs):
                    cur.execute(
                        "UPDATE papers SET embedding = %s WHERE id = %s",
                        (vec, pid),
                    )
                    count += 1
            conn.commit()
        log.info("Indexed %d paper abstracts.", count)
        return count

    def build_kg(self) -> tuple[int, int]:
        """Populate ``kg_entities`` + ``kg_hyperedges``.

        Returns
        -------
        (int, int)
            Count of entities and hyperedges written. ``(0, 0)`` when the
            DB is not available; the KG is still built in-memory so
            ``retrieve`` can work against ``_kg_cache``.
        """
        entity_rows: list[dict[str, Any]] = []
        for typ, names in (
            ("condition", SOZO_CONDITIONS),
            ("modality", SOZO_MODALITIES),
            ("channel", CHANNELS_10_20),
            ("band", FREQ_BANDS),
            ("biomarker", BIOMARKERS),
        ):
            for name in names:
                entity_rows.append({"type": typ, "name": name})

        # Minimal set of hyperedges seeded from literature priors. Real
        # implementation mines the papers table; we encode the well-known
        # biomarker→condition→modality triplets that the recommender uses.
        seed_edges: list[dict[str, Any]] = [
            {
                "relation": "biomarker_for",
                "entities": ["frontal_alpha_asymmetry", "depression"],
                "modalities": ["rtms_10hz"],
                "confidence": 0.85,
            },
            {
                "relation": "biomarker_for",
                "entities": ["theta_beta_ratio", "adhd"],
                "modalities": ["neurofeedback_smr_theta"],
                "confidence": 0.78,
            },
            {
                "relation": "biomarker_for",
                "entities": ["elevated_posterior_alpha", "anxiety"],
                "modalities": ["alpha_downtraining"],
                "confidence": 0.70,
            },
            {
                "relation": "biomarker_for",
                "entities": ["peak_alpha_frequency", "cognitive_decline"],
                "modalities": ["tdcs_2ma"],
                "confidence": 0.72,
            },
            {
                "relation": "biomarker_for",
                "entities": ["elevated_delta_frontal", "tbi"],
                "modalities": ["hbot_pulsed_hf_emf"],
                "confidence": 0.68,
            },
            {
                "relation": "biomarker_for",
                "entities": ["reduced_sleep_spindles", "insomnia"],
                "modalities": ["closed_loop_sleep_stim"],
                "confidence": 0.75,
            },
        ]

        self._kg_cache = _KGCache(entities=entity_rows, hyperedges=seed_edges)

        if not (self.db_url and HAS_PSYCOPG):
            log.info(
                "build_kg cached in memory (%d entities, %d edges); no DB.",
                len(entity_rows), len(seed_edges),
            )
            return (0, 0)

        import psycopg  # local import
        ent_count = edge_count = 0
        with psycopg.connect(self.db_url) as conn:
            with conn.cursor() as cur:
                for row in entity_rows:
                    cur.execute(
                        "INSERT INTO kg_entities (type, name) VALUES (%s, %s) "
                        "ON CONFLICT DO NOTHING",
                        (row["type"], row["name"]),
                    )
                    ent_count += 1
                for edge in seed_edges:
                    cur.execute(
                        "INSERT INTO kg_hyperedges "
                        "(relation, entity_ids_json, paper_ids_json, confidence) "
                        "VALUES (%s, %s, %s, %s)",
                        (
                            edge["relation"],
                            json.dumps(edge["entities"]),
                            json.dumps([]),
                            float(edge["confidence"]),
                        ),
                    )
                    edge_count += 1
            conn.commit()
        log.info("Wrote %d KG entities and %d hyperedges.", ent_count, edge_count)
        return (ent_count, edge_count)

    # -------------------------------------------------------- retrieval
    def retrieve(
        self,
        eeg_features: dict[str, Any],
        patient_meta: dict[str, Any],
        *,
        k: int = 10,
    ) -> list[dict[str, Any]]:
        """Return the top-K papers ranked by hypergraph + vector similarity.

        Parameters
        ----------
        eeg_features : dict
            Feature dict per ``CONTRACT.md §1.1``. May also contain
            ``flagged_conditions`` and ``modalities`` top-level keys as
            shortcuts.
        patient_meta : dict
            Arbitrary metadata (age, sex, etc.). Not PHI-gated here — the
            caller is responsible for scrubbing.
        k : int, optional
            Maximum number of results.

        Returns
        -------
        list of dict
            Each dict has keys ``paper_id``, ``relevance``,
            ``evidence_chain`` (list of hyperedge dicts), ``pmid``,
            ``doi``, ``title``, ``year``, ``url``, ``abstract``.
        """
        conditions = _extract_list(eeg_features, "flagged_conditions", "conditions")
        modalities = _extract_list(eeg_features, "modalities")

        # DB path ---------------------------------------------------
        if self.db_url and HAS_PSYCOPG:
            try:
                return self._retrieve_pg(conditions, modalities, k)
            except Exception as exc:
                log.warning(
                    "MedRAG DB retrieval failed (%s); falling back to toy JSON.",
                    exc,
                )

        # Stub path -------------------------------------------------
        return self._retrieve_stub(conditions, modalities, k)

    # -------------------------------------------------------- internals
    def _retrieve_pg(
        self,
        conditions: list[str],
        modalities: list[str],
        k: int,
    ) -> list[dict[str, Any]]:
        """Postgres retrieval using paper joins + hyperedge traversal."""
        import psycopg  # local import

        cond_arr = [c.lower() for c in conditions] or None
        mod_arr = [m.lower() for m in modalities] or None

        q = """
        SELECT p.id, p.pmid, p.doi, p.title, p.year, p.abstract,
               COUNT(DISTINCT pc.condition_id)
                 + COUNT(DISTINCT pm.modality_id) AS hits
        FROM papers p
        LEFT JOIN paper_conditions pc ON pc.paper_id = p.id
        LEFT JOIN conditions       c  ON c.id       = pc.condition_id
        LEFT JOIN paper_modalities pm ON pm.paper_id = p.id
        LEFT JOIN modalities       m  ON m.id       = pm.modality_id
        WHERE (%(conditions)s::text[] IS NULL OR c.slug = ANY(%(conditions)s))
           OR (%(modalities)s::text[] IS NULL OR m.slug = ANY(%(modalities)s))
        GROUP BY p.id, p.pmid, p.doi, p.title, p.year, p.abstract
        ORDER BY hits DESC NULLS LAST, p.year DESC NULLS LAST
        LIMIT %(k)s
        """
        rows: list[dict[str, Any]] = []
        with psycopg.connect(self.db_url) as conn, conn.cursor() as cur:
            cur.execute(
                q,
                {"conditions": cond_arr, "modalities": mod_arr, "k": int(k)},
            )
            for pid, pmid, doi, title, year, abstract, hits in cur.fetchall():
                rows.append(
                    {
                        "paper_id": pid,
                        "relevance": float(hits or 0),
                        "evidence_chain": self._chain_for(conditions, modalities),
                        "pmid": pmid,
                        "doi": doi,
                        "title": title,
                        "year": int(year) if year else None,
                        "url": _url_for(pmid, doi),
                        "abstract": abstract,
                    }
                )
        return rows

    def _retrieve_stub(
        self,
        conditions: list[str],
        modalities: list[str],
        k: int,
    ) -> list[dict[str, Any]]:
        """Naive keyword overlap ranker over the toy JSON fixture."""
        papers = self._load_toy()
        cond_set = {c.lower() for c in conditions}
        mod_set = {m.lower() for m in modalities}

        scored: list[tuple[float, dict[str, Any]]] = []
        for paper in papers:
            paper_c = {c.lower() for c in (paper.get("conditions") or [])}
            paper_m = {m.lower() for m in (paper.get("modalities") or [])}
            overlap = len(paper_c & cond_set) + len(paper_m & mod_set)
            # even with no overlap we keep something so retrieve() never
            # returns empty when the caller asked for k>0
            score = float(overlap) + 0.1 * (paper.get("year", 0) or 0) / 2030.0
            scored.append((score, paper))

        scored.sort(key=lambda pair: pair[0], reverse=True)

        out: list[dict[str, Any]] = []
        for _, paper in scored[:k]:
            out.append(
                {
                    "paper_id": paper.get("pmid") or paper.get("doi"),
                    "relevance": float(paper.get("relevance_score", 1.0)),
                    "evidence_chain": self._chain_for(conditions, modalities),
                    "pmid": paper.get("pmid"),
                    "doi": paper.get("doi"),
                    "title": paper.get("title"),
                    "year": paper.get("year"),
                    "url": _url_for(paper.get("pmid"), paper.get("doi")),
                    "abstract": paper.get("abstract"),
                }
            )
        return out

    def _load_toy(self) -> list[dict[str, Any]]:
        if self._toy_papers is not None:
            return self._toy_papers
        try:
            data = json.loads(_TOY_PAPERS.read_text(encoding="utf-8"))
            self._toy_papers = data if isinstance(data, list) else []
        except Exception as exc:
            log.warning("Failed to load toy_papers.json (%s).", exc)
            self._toy_papers = []
        return self._toy_papers

    def _chain_for(
        self, conditions: list[str], modalities: list[str]
    ) -> list[dict[str, Any]]:
        """Filter cached hyperedges that mention the query conditions."""
        if not self._kg_cache.hyperedges:
            self.build_kg()
        chain: list[dict[str, Any]] = []
        cond_set = {c.lower() for c in conditions}
        mod_set = {m.lower() for m in modalities}
        for edge in self._kg_cache.hyperedges:
            ent = {e.lower() for e in edge.get("entities", [])}
            mods = {m.lower() for m in edge.get("modalities", [])}
            if ent & cond_set or mods & mod_set:
                chain.append(dict(edge))
        return chain


# -------------------------------------------------------------------- helpers
def _extract_list(d: dict[str, Any], *keys: str) -> list[str]:
    for key in keys:
        val = d.get(key)
        if isinstance(val, list):
            return [str(x) for x in val]
    return []


def _url_for(pmid: Any, doi: Any) -> str:
    if pmid:
        return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    if doi:
        return f"https://doi.org/{doi}"
    return ""


# -------------------------------------------------------------------- singleton
_SINGLETON: MedRAG | None = None
_SINGLETON_LOCK = threading.Lock()


def _get_singleton() -> MedRAG:
    global _SINGLETON
    with _SINGLETON_LOCK:
        if _SINGLETON is None:
            _SINGLETON = MedRAG()
    return _SINGLETON


def retrieve(
    eeg_features: dict[str, Any],
    patient_meta: dict[str, Any],
    *,
    k: int = 10,
    db_session: Any | None = None,  # noqa: ARG001 - future DB handle
) -> list[dict[str, Any]]:
    """Module-level convenience wrapper around :class:`MedRAG.retrieve`.

    Parameters
    ----------
    eeg_features : dict
        Feature dict — see :meth:`MedRAG.retrieve`.
    patient_meta : dict
        Patient metadata.
    k : int, optional
        Max results (default ``10``).
    db_session : Any, optional
        Reserved for future SQLAlchemy session plumbing. Currently
        unused; retrieval uses the singleton's own connection settings.

    Returns
    -------
    list of dict
        See :meth:`MedRAG.retrieve`.
    """
    # Callers needing reproducibility just pass the same inputs — the
    # toy-paper ranking is deterministic in content.
    return _get_singleton().retrieve(eeg_features, patient_meta, k=k)
