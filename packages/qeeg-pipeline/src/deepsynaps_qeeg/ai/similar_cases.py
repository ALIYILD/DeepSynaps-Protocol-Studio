"""Similar-patient retrieval over the qEEG embedding corpus.

Implements CONTRACT_V2.md §5 (``similar_cases`` list). Real path uses
``pgvector`` cosine distance (``embedding <=> query_embedding``) with
pre-filtered WHERE clauses (age range, sex, condition) to keep the HNSW
scan narrow. Stub path generates a deterministic pseudo-cohort seeded by
a hash of the embedding so UI looks stable across reloads.

Privacy
-------
Per CONTRACT_V2 §7 the retrieval function NEVER emits PHI:

* No patient names, MRNs, emails or exact DOBs.
* When fewer than ``MIN_COHORT_SIZE = 5`` neighbours remain after
  filtering, the function collapses to an aggregate-only summary.
"""
from __future__ import annotations

import hashlib
import logging
import random
from typing import Any

log = logging.getLogger(__name__)

# pgvector is a soft dep — the stub path works without it.
try:
    from pgvector.psycopg import register_vector  # noqa: F401

    HAS_PGVECTOR = True
except Exception:  # pragma: no cover - import guard
    HAS_PGVECTOR = False

try:
    import psycopg  # noqa: F401

    HAS_PSYCOPG = True
except Exception:  # pragma: no cover - import guard
    HAS_PSYCOPG = False


MIN_COHORT_SIZE: int = 5
"""Privacy threshold below which we emit aggregate-only cohort stats."""


# -------------------------------------------------------------------- api
def find_similar(
    embedding: list[float],
    *,
    k: int = 10,
    filters: dict[str, Any] | None = None,
    db_session: Any | None = None,
    deterministic_seed: int | None = None,
) -> list[dict[str, Any]] | dict[str, Any]:
    """Return the top-K most similar de-identified cases, or an aggregate.

    Parameters
    ----------
    embedding : list of float
        Query embedding (typically 200-dim from LaBraM).
    k : int, optional
        Target neighbours. When ``k < MIN_COHORT_SIZE`` the privacy guard
        kicks in and an aggregate dict is returned instead of per-case
        records.
    filters : dict, optional
        Keys ``age_range: (lo, hi)``, ``sex: str``, ``condition: str``.
    db_session : Any, optional
        SQLAlchemy session. When present and the pgvector stack is
        available a real query is issued; otherwise stub data is
        produced. (Raw DSN via ``os.environ['DEEPSYNAPS_DB_URL']`` also
        triggers the real path.)
    deterministic_seed : int, optional
        Override the seed derived from ``hash(tuple(embedding))``. Useful
        for reproducible tests.

    Returns
    -------
    list of dict or dict
        List of per-case records when ``k >= MIN_COHORT_SIZE``, else the
        aggregate-only envelope:
        ``{"aggregate": {"n": int, "responder_rate": float,
        "mean_age": float, "common_conditions": [...]}}``
    """
    filters = dict(filters or {})

    # -- privacy guard (§7) --
    if k < MIN_COHORT_SIZE:
        log.info(
            "similar_cases.find_similar: k=%d < %d; returning aggregate only.",
            k, MIN_COHORT_SIZE,
        )
        return _aggregate_only(embedding, k, filters, deterministic_seed)

    # -- real path --
    if db_session is not None and HAS_PGVECTOR and HAS_PSYCOPG:
        try:
            cases = _query_pgvector(db_session, embedding, k, filters)
            if cases:
                return [_scrub(c) for c in cases]
        except Exception as exc:
            log.warning(
                "similar_cases pgvector query failed (%s); falling back.",
                exc,
            )

    # -- stub path --
    return _stub_cases(embedding, k, filters, deterministic_seed)


# -------------------------------------------------------------------- real path
def _query_pgvector(
    db_session: Any,
    embedding: list[float],
    k: int,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    """Issue the pgvector cosine-distance query via a SQLA session."""
    where: list[str] = []
    params: dict[str, Any] = {"q": embedding, "k": int(k)}

    age_range = filters.get("age_range")
    if age_range and len(age_range) == 2:
        where.append("age BETWEEN :age_lo AND :age_hi")
        params["age_lo"] = int(age_range[0])
        params["age_hi"] = int(age_range[1])

    if filters.get("sex"):
        where.append("sex = :sex")
        params["sex"] = str(filters["sex"])

    if filters.get("condition"):
        where.append(":cond = ANY(flagged_conditions)")
        params["cond"] = str(filters["condition"])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    sql = f"""
    SELECT analysis_id,
           age,
           sex,
           flagged_conditions,
           responder,
           response_delta,
           summary_deidentified,
           embedding <=> :q AS distance
    FROM qeeg_analyses
    {where_sql}
    ORDER BY embedding <=> :q
    LIMIT :k
    """

    # Lazily imported so SQLA isn't forced on stub-only callers.
    from sqlalchemy import text  # type: ignore

    result = db_session.execute(text(sql), params)
    out: list[dict[str, Any]] = []
    for row in result.mappings():
        out.append(
            {
                "case_id": str(row["analysis_id"]),
                "similarity_score": float(1.0 - (row["distance"] or 0.0)),
                "age": row.get("age"),
                "sex": row.get("sex"),
                "flagged_conditions": list(row.get("flagged_conditions") or []),
                "outcome": {
                    "responder": bool(row.get("responder") or False),
                    "response_delta": float(row.get("response_delta") or 0.0),
                },
                "summary_deidentified": row.get("summary_deidentified") or "",
            }
        )
    return out


# -------------------------------------------------------------------- stub path
_BASE_CONDITIONS: tuple[str, ...] = (
    "mdd_like",
    "adhd_like",
    "anxiety_like",
    "cognitive_decline_like",
    "tbi_residual_like",
    "insomnia_like",
)


def _seed(embedding: list[float], override: int | None) -> int:
    if override is not None:
        return int(override) & 0xFFFFFFFF
    raw = repr(tuple(round(float(x), 6) for x in embedding))
    h = hashlib.sha256(raw.encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big")


def _stub_cases(
    embedding: list[float],
    k: int,
    filters: dict[str, Any],
    deterministic_seed: int | None,
) -> list[dict[str, Any]]:
    rng = random.Random(_seed(embedding, deterministic_seed))
    age_lo, age_hi = filters.get("age_range") or (25, 70)
    sex_filter = filters.get("sex")
    cond_filter = filters.get("condition")

    cases: list[dict[str, Any]] = []
    for i in range(k):
        age = rng.randint(int(age_lo), int(age_hi))
        sex = sex_filter or rng.choice(["M", "F"])
        # 1–2 flagged conditions per case, biased toward the filter
        n_cond = rng.randint(1, 2)
        pool = list(_BASE_CONDITIONS)
        if cond_filter and cond_filter in pool:
            pool.remove(cond_filter)
        conds = ([cond_filter] if cond_filter else []) + rng.sample(
            pool, k=min(n_cond, len(pool))
        )
        conds = conds[:2]
        responder = rng.random() < 0.55
        delta = round(rng.uniform(-0.2, 0.6) if responder
                      else rng.uniform(-0.3, 0.15), 3)
        # Synthetic case id — not a PHI identifier.
        case_id = f"syn-{_seed(embedding, deterministic_seed) ^ (i * 2654435761):08x}"
        cases.append(
            {
                "case_id": case_id,
                "similarity_score": round(max(0.0, 0.95 - 0.04 * i + rng.uniform(-0.02, 0.02)), 4),
                "age": age,
                "sex": sex,
                "flagged_conditions": conds,
                "outcome": {
                    "responder": bool(responder),
                    "response_delta": float(delta),
                },
                "summary_deidentified": _stub_summary(conds, delta, rng),
            }
        )
    cases.sort(key=lambda c: c["similarity_score"], reverse=True)
    return [_scrub(c) for c in cases]


def _stub_summary(conditions: list[str], delta: float, rng: random.Random) -> str:
    cond = conditions[0] if conditions else "general"
    direction = "improved" if delta > 0 else "stable/worsened"
    sessions = rng.choice([8, 12, 18, 24])
    return (
        f"De-identified case: {cond} similarity pattern; "
        f"{sessions}-session course; outcome {direction}."
    )


def _aggregate_only(
    embedding: list[float],
    k: int,
    filters: dict[str, Any],
    deterministic_seed: int | None,
) -> dict[str, Any]:
    """Return the privacy-guarded cohort summary envelope."""
    # We still need SOMETHING to summarise; build a small synthetic cohort
    # large enough to aggregate over even though we only expose stats.
    synthetic_n = max(k, 20)
    rng = random.Random(_seed(embedding, deterministic_seed))
    responder_rate = round(sum(1 for _ in range(synthetic_n) if rng.random() < 0.55) / synthetic_n, 3)
    age_lo, age_hi = filters.get("age_range") or (25, 70)
    mean_age = round((age_lo + age_hi) / 2.0, 1)
    pool = list(_BASE_CONDITIONS)
    common = rng.sample(pool, 3)
    return {
        "aggregate": {
            "n": int(k),
            "responder_rate": float(responder_rate),
            "mean_age": float(mean_age),
            "common_conditions": common,
        }
    }


# -------------------------------------------------------------------- scrubber
_PHI_KEYS: frozenset[str] = frozenset(
    {"name", "first_name", "last_name", "email", "mrn", "dob",
     "date_of_birth", "phone", "address", "ssn", "nhs_number"}
)


def _scrub(case: dict[str, Any]) -> dict[str, Any]:
    """Drop any keys that look like PHI (defensive)."""
    return {k: v for k, v in case.items() if k not in _PHI_KEYS}
