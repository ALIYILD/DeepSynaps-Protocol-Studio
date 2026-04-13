"""Deterministic protocol ranking among eligible registry rows — no LLM, no eligibility bypass.

Structured rules (personalization_rules.csv) are applied first; token overlap is fallback only
when no structured score applies. Ordering: structured → evidence → failed-modality penalty →
token fallback → CSV index.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from deepsynaps_core_schema import ProtocolDraftRequest

# --- Controlled tag vocabulary (narrow; extend only via personalization_rules.csv + aliases here) ---

PHENOTYPE_INPUT_ALIASES: dict[str, str] = {
    "anxious": "anxious_depression_mix",
    "anxiety": "anxious_depression_mix",
    "anxious depression": "anxious_depression_mix",
    "mixed anxiety": "anxious_depression_mix",
    "anhedonic": "anhedonia_cluster",
    "anhedonia": "anhedonia_cluster",
}

# qEEG free-text phrases → canonical tags (only these participate in structured rules).
QEEG_PHRASE_TO_CANONICAL: dict[str, str] = {
    "alpha asymmetry": "frontal_alpha_asymmetry",
    "frontal asymmetry": "frontal_alpha_asymmetry",
    "frontal alpha asymmetry": "frontal_alpha_asymmetry",
}

# prior_response free text → single canonical tag (registry rules use the same tokens).
PRIOR_RESPONSE_ALIASES: dict[str, str] = {
    "partial response": "partial_response",
    "partial": "partial_response",
    "non responder": "non_responder",
    "non-responder": "non_responder",
    "nonresponse": "non_responder",
    "responder": "responder",
    "response": "responder",
}

_EVIDENCE_WEIGHT = {"EV-A": 40, "EV-B": 30, "EV-C": 15, "EV-D": 5}
_FAILED_MODALITY_PENALTY = 120
_TOKEN_SCORE = 35
_TOKEN_CAP = 120


@dataclass(frozen=True)
class FiredStructuredRule:
    rule_id: str
    score_delta: int
    rationale_label: str


@dataclass
class NormalizedPersonalization:
    """Normalized optional hints; canonical tags drive structured rules."""

    canonical_phenotype_tags: list[str] = field(default_factory=list)
    canonical_qeeg_tags: list[str] = field(default_factory=list)
    phenotype_unmapped: list[str] = field(default_factory=list)
    comorbidity_tags_norm: list[str] = field(default_factory=list)
    prior_failed_modalities_norm: list[str] = field(default_factory=list)
    prior_response_norm: str | None = None
    canonical_prior_response: str | None = None
    qeeg_free_text_unmapped: bool = False


@dataclass
class PersonalizationRankingResult:
    """Outcome of select_protocol_among_eligible (ranking metadata for API + audit)."""

    chosen: dict[str, str]
    ranking_factors_applied: list[str]
    protocol_ranking_rationale: list[str]
    structured_rules_applied: list[str]
    structured_rule_labels_applied: list[str]
    structured_rule_score_total: int
    structured_rule_matches_by_protocol: dict[str, list[FiredStructuredRule]]
    # Observability (ranking logic unchanged; for governance / why-selected projections)
    csv_baseline_protocol_id: str | None = None
    csv_baseline_protocol_name: str | None = None
    personalization_changed_vs_csv_first: bool | None = None
    structured_score_by_protocol: dict[str, int] = field(default_factory=dict)
    token_fallback_used: bool = False
    ranked_protocol_ids: list[str] = field(default_factory=list)


def _normalize_prior_response_tag(raw: str | None) -> str | None:
    if not raw or not raw.strip():
        return None
    s = raw.strip().lower()
    if s in PRIOR_RESPONSE_ALIASES:
        return PRIOR_RESPONSE_ALIASES[s]
    if s in PRIOR_RESPONSE_ALIASES.values():
        return s
    return None


def normalize_personalization_payload(payload: ProtocolDraftRequest) -> NormalizedPersonalization:
    """Map inputs to canonical tags; unknown phenotype strings are retained but not used for rules."""
    raw_pheno = [s.strip().lower() for s in payload.phenotype_tags if s and s.strip()]
    canonical_p: list[str] = []
    unmapped: list[str] = []
    for r in sorted(set(raw_pheno)):
        if r in PHENOTYPE_INPUT_ALIASES:
            canonical_p.append(PHENOTYPE_INPUT_ALIASES[r])
        elif r in PHENOTYPE_INPUT_ALIASES.values():
            canonical_p.append(r)
        else:
            unmapped.append(r)

    qeeg_canon, qeeg_unmapped = _normalize_qeeg_to_canonical((payload.qeeg_summary or "").strip())

    canonical_p = _dedupe_sorted(canonical_p)
    canonical_q = _dedupe_sorted(qeeg_canon)
    prior_raw = (payload.prior_response or "").strip().lower() or None

    return NormalizedPersonalization(
        canonical_phenotype_tags=canonical_p,
        canonical_qeeg_tags=canonical_q,
        phenotype_unmapped=sorted(set(unmapped)),
        comorbidity_tags_norm=_dedupe_sorted(s.strip().lower() for s in payload.comorbidities if s and s.strip()),
        prior_failed_modalities_norm=_dedupe_sorted(
            s.strip().lower() for s in payload.prior_failed_modalities if s and s.strip()
        ),
        prior_response_norm=prior_raw,
        canonical_prior_response=_normalize_prior_response_tag(payload.prior_response),
        qeeg_free_text_unmapped=qeeg_unmapped,
    )


def _normalize_qeeg_to_canonical(qeeg_raw: str) -> tuple[list[str], bool]:
    """Return (canonical tags, True if non-empty text had no allowlist mapping)."""
    if not qeeg_raw:
        return [], False
    ql = qeeg_raw.lower()
    found: list[str] = []
    for phrase, canon in QEEG_PHRASE_TO_CANONICAL.items():
        if phrase in ql:
            found.append(canon)
    unmapped = bool(qeeg_raw.strip()) and not found and len(qeeg_raw.strip()) > 2
    return _dedupe_sorted(found), unmapped


def _dedupe_sorted(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in sorted(items):
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def personalization_lists_non_empty(norm: NormalizedPersonalization) -> list[str]:
    used: list[str] = []
    if norm.canonical_phenotype_tags or norm.phenotype_unmapped:
        used.append("phenotype_tags")
    if norm.comorbidity_tags_norm:
        used.append("comorbidities")
    if norm.prior_failed_modalities_norm:
        used.append("prior_failed_modalities")
    if norm.prior_response_norm:
        used.append("prior_response")
    if norm.canonical_qeeg_tags or norm.qeeg_free_text_unmapped:
        used.append("qeeg_summary")
    return used


def _registry_has_comorbidity_or_prior_rules(rules: list[dict[str, str]]) -> bool:
    for r in rules:
        if not _is_active_flag(r.get("Active", "")):
            continue
        if (r.get("Comorbidity_Tag") or "").strip() or (r.get("Prior_Response_Tag") or "").strip():
            return True
    return False


def has_active_ranking_hints(norm: NormalizedPersonalization, personalization_rules: list[dict[str, str]]) -> bool:
    """Ranking path when structured tags, failed modalities, or registry-extended hints apply."""
    if norm.canonical_phenotype_tags or norm.canonical_qeeg_tags or norm.prior_failed_modalities_norm:
        return True
    if _registry_has_comorbidity_or_prior_rules(personalization_rules) and (
        norm.comorbidity_tags_norm or norm.canonical_prior_response
    ):
        return True
    return False


def _is_active_flag(raw: str) -> bool:
    return raw.strip().lower() in ("y", "yes", "true", "1", "active")


def structured_score_for_protocol(
    protocol: dict[str, str],
    rules: list[dict[str, str]],
    *,
    condition_id: str,
    modality_id: str,
    device_id: str,
    canonical_pheno: set[str],
    canonical_qeeg: set[str],
    canonical_comorbidity: set[str],
    canonical_prior: str | None,
) -> tuple[int, list[FiredStructuredRule]]:
    """Sum Score_Delta from matching active rules; fires listed in Rule_ID order."""
    total = 0
    fired: list[FiredStructuredRule] = []
    for rule in sorted(rules, key=lambda r: r.get("Rule_ID", "")):
        if not _is_active_flag(rule.get("Active", "")):
            continue
        if rule.get("Condition_ID", "").strip() != condition_id:
            continue
        mod = (rule.get("Modality_ID") or "").strip()
        if mod and mod != modality_id:
            continue
        dev = (rule.get("Device_ID") or "").strip()
        if dev and dev != device_id:
            continue
        pt = (rule.get("Phenotype_Tag") or "").strip()
        if pt and pt not in canonical_pheno:
            continue
        qt = (rule.get("QEEG_Tag") or "").strip()
        if qt and qt not in canonical_qeeg:
            continue
        ct = (rule.get("Comorbidity_Tag") or "").strip()
        if ct and ct not in canonical_comorbidity:
            continue
        prt = (rule.get("Prior_Response_Tag") or "").strip()
        if prt and (not canonical_prior or prt != canonical_prior):
            continue
        pref = (rule.get("Preferred_Protocol_ID") or "").strip()
        if not pref or pref != protocol.get("Protocol_ID", "").strip():
            continue
        try:
            delta = int((rule.get("Score_Delta") or "0").strip())
        except ValueError:
            continue
        rid = rule.get("Rule_ID", "").strip()
        lbl = (rule.get("Rationale_Label") or "").strip()
        total += delta
        fired.append(FiredStructuredRule(rule_id=rid, score_delta=delta, rationale_label=lbl))
    return total, fired


def _phenotype_blob(phenotypes_by_id: dict[str, dict[str, str]], phenotype_id: str) -> str:
    row = phenotypes_by_id.get(phenotype_id) or {}
    parts = [
        row.get("Symptom_or_Phenotype_Name", ""),
        row.get("Description", ""),
        row.get("Associated_Conditions", ""),
        row.get("Candidate_Modalities", ""),
        row.get("Assessment_Inputs_Needed", ""),
    ]
    return " ".join(parts).lower()


def _token_overlap_score(
    protocol: dict[str, str],
    phenotypes_by_id: dict[str, dict[str, str]],
    unmapped_phenotype_tokens: set[str],
    extra_tokens_for_overlap: set[str],
) -> int:
    """Fallback: substring overlap for unmapped phenotype + synonym expansion (bounded)."""
    combined = set(unmapped_phenotype_tokens) | extra_tokens_for_overlap
    for t in list(combined):
        if t.startswith("anxious"):
            combined.add("anxiety")
    combined = {t for t in combined if len(t) >= 3}
    if not combined:
        return 0
    pid = (protocol.get("Phenotype_ID") or "").strip()
    if not pid:
        return 0
    blob = _phenotype_blob(phenotypes_by_id, pid)
    score = 0
    for tok in combined:
        tl = tok.replace("_", " ")
        if tok in blob or tl in blob:
            score += _TOKEN_SCORE
    return min(score, _TOKEN_CAP)


def _evidence_score(protocol: dict[str, str]) -> int:
    g = (protocol.get("Evidence_Grade") or "").strip()
    return _EVIDENCE_WEIGHT.get(g, 0)


def _failed_modality_penalty(protocol: dict[str, str], failed_modality_ids: set[str]) -> int:
    mid = protocol.get("Modality_ID") or ""
    return _FAILED_MODALITY_PENALTY if mid in failed_modality_ids else 0


def select_protocol_among_eligible(
    *,
    eligible: list[dict[str, str]],
    protocol_file_index: dict[str, int],
    phenotypes_by_id: dict[str, dict[str, str]],
    failed_modality_ids: set[str],
    norm: NormalizedPersonalization,
    personalization_rules: list[dict[str, str]],
    condition_id: str,
    modality_id: str,
    device_id: str,
) -> PersonalizationRankingResult:
    """Deterministic ranking with structured-rule audit metadata."""
    if not eligible:
        raise ValueError("eligible must be non-empty")

    if len(eligible) == 1:
        p0 = eligible[0]
        pid0 = p0["Protocol_ID"]
        return PersonalizationRankingResult(
            chosen=p0,
            ranking_factors_applied=[],
            protocol_ranking_rationale=[
                f"Single eligible protocol row ({p0['Protocol_ID']}); ranking among alternatives not required."
            ],
            structured_rules_applied=[],
            structured_rule_labels_applied=[],
            structured_rule_score_total=0,
            structured_rule_matches_by_protocol={pid0: []},
            csv_baseline_protocol_id=None,
            csv_baseline_protocol_name=None,
            personalization_changed_vs_csv_first=None,
            structured_score_by_protocol={pid0: 0},
            token_fallback_used=False,
            ranked_protocol_ids=[pid0],
        )

    baseline = _baseline_csv_first(eligible, protocol_file_index)

    if not has_active_ranking_hints(norm, personalization_rules):
        ranked_ids = [p["Protocol_ID"] for p in sorted(eligible, key=lambda p: protocol_file_index.get(p["Protocol_ID"], 999))]
        return PersonalizationRankingResult(
            chosen=baseline,
            ranking_factors_applied=[],
            protocol_ranking_rationale=[
                f"{len(eligible)} eligible protocol rows; no active ranking hints - "
                f"selected {baseline['Protocol_ID']} ({baseline['Protocol_Name']}) as the first matching row "
                "in imported registry CSV order (legacy deterministic behavior)."
            ],
            structured_rules_applied=[],
            structured_rule_labels_applied=[],
            structured_rule_score_total=0,
            structured_rule_matches_by_protocol={p["Protocol_ID"]: [] for p in eligible},
            csv_baseline_protocol_id=baseline["Protocol_ID"],
            csv_baseline_protocol_name=baseline.get("Protocol_Name", ""),
            personalization_changed_vs_csv_first=False,
            structured_score_by_protocol={p["Protocol_ID"]: 0 for p in eligible},
            token_fallback_used=False,
            ranked_protocol_ids=ranked_ids,
        )

    pheno_set = set(norm.canonical_phenotype_tags)
    qeeg_set = set(norm.canonical_qeeg_tags)
    comorb_set = set(norm.comorbidity_tags_norm)
    prior_tag = norm.canonical_prior_response
    unmapped_pheno = set(norm.phenotype_unmapped)

    structured_by_pid: dict[str, int] = {p["Protocol_ID"]: 0 for p in eligible}
    fires_by_pid: dict[str, list[FiredStructuredRule]] = {p["Protocol_ID"]: [] for p in eligible}
    for p in eligible:
        sc, fired = structured_score_for_protocol(
            p,
            personalization_rules,
            condition_id=condition_id,
            modality_id=modality_id,
            device_id=device_id,
            canonical_pheno=pheno_set,
            canonical_qeeg=qeeg_set,
            canonical_comorbidity=comorb_set,
            canonical_prior=prior_tag,
        )
        structured_by_pid[p["Protocol_ID"]] = sc
        fires_by_pid[p["Protocol_ID"]] = fired

    max_struct = max(structured_by_pid.values()) if structured_by_pid else 0
    use_token_fallback = max_struct == 0

    extra_overlap_tokens: set[str] = set()
    if norm.canonical_qeeg_tags:
        extra_overlap_tokens.update(norm.canonical_qeeg_tags)

    def sort_key(p: dict[str, str]) -> tuple:
        pid = p["Protocol_ID"]
        st = structured_by_pid.get(pid, 0)
        ev = _evidence_score(p)
        pen = _failed_modality_penalty(p, failed_modality_ids)
        tok = 0
        if use_token_fallback:
            tok = _token_overlap_score(
                p,
                phenotypes_by_id,
                unmapped_pheno,
                extra_overlap_tokens,
            )
        return (-st, -ev, pen, -tok, protocol_file_index.get(pid, 999))

    ranked = sorted(eligible, key=sort_key)
    ranked_ids = [p["Protocol_ID"] for p in ranked]
    chosen = ranked[0]
    chosen_id = chosen["Protocol_ID"]
    chosen_fires = fires_by_pid.get(chosen_id, [])

    factors: list[str] = []
    rationale: list[str] = [
        f"{len(eligible)} eligible protocol rows after registry/device filtering; deterministic ordering applied."
    ]

    if max_struct > 0:
        factors.append("structured_personalization_rules")
        rationale.append(
            "Structured rules (personalization_rules.csv): Rule_ID order is deterministic; "
            "Score_Delta values for the selected protocol are summed in structured_rules_applied / "
            "structured_rule_score_total."
        )
        rationale.append(
            f"Selected protocol {chosen_id}: structured_rule_score_total={structured_by_pid.get(chosen_id, 0)} "
            f"from rules {', '.join(f.rule_id for f in chosen_fires) or '(none)' }."
        )
        for p in eligible:
            sid = p["Protocol_ID"]
            if structured_by_pid.get(sid, 0) > 0:
                ff = fires_by_pid[sid]
                rationale.append(
                    f"{sid}: structured_score={structured_by_pid[sid]} "
                    f"(rules: {', '.join(f'{x.rule_id}(+{x.score_delta})' for x in ff)})."
                )
    else:
        rationale.append(
            "No structured personalization rule matched the request’s canonical tags for any eligible row; "
            "structured score is zero everywhere — evidence / failed-modality / token fallback / CSV order apply."
        )

    if use_token_fallback and (unmapped_pheno or extra_overlap_tokens):
        factors.append("phenotype_text_overlap_fallback")
        rationale.append(
            "Token overlap fallback ranked rows (unmapped phenotype strings and/or qEEG-derived tokens vs phenotype CSV text) "
            "because no structured rule produced a non-zero score for any eligible protocol."
        )
    elif not use_token_fallback:
        rationale.append(
            "Token overlap fallback was not used for ordering because at least one structured rule produced a non-zero score."
        )

    factors.append("evidence_grade_weight")
    rationale.append("Evidence_Grade is the next sort key after structured score (does not override structured totals).")

    if failed_modality_ids:
        factors.append("prior_failed_modality_downrank")
        rationale.append(
            "Failed-modality penalty applies as the next key (does not remove eligibility)."
        )

    factors.append("csv_order_tiebreak")
    rationale.append("Final tie-break: imported protocols.csv row order (lower index wins).")

    if chosen["Protocol_ID"] != baseline["Protocol_ID"]:
        factors.append("personalization_changed_selection_vs_csv_first")
        rationale.append(
            f"Selection preferred {chosen['Protocol_ID']} ({chosen['Protocol_Name']}) over "
            f"CSV-first {baseline['Protocol_ID']} ({baseline['Protocol_Name']})."
        )
    else:
        rationale.append(
            f"Outcome matches CSV-first baseline {baseline['Protocol_ID']} under current keys."
        )

    if norm.phenotype_unmapped:
        factors.append("unmapped_phenotype_strings_audit_only")
        rationale.append(
            f"Phenotype strings with no canonical mapping ({', '.join(norm.phenotype_unmapped)}) "
            "were not used for structured rules; they may contribute only to overlap fallback."
        )
    if norm.qeeg_free_text_unmapped:
        factors.append("qeeg_summary_no_allowlisted_canonical_match")
        rationale.append(
            "qeeg_summary text did not match allowlisted phrases for canonical qEEG tags; "
            "it was not used as a structured scoring signal."
        )
    if norm.comorbidity_tags_norm:
        has_comorb_rule = any((r.get("Comorbidity_Tag") or "").strip() for r in personalization_rules)
        rationale.append(
            "Comorbidity tags recorded; structured comorbidity matching applies only when personalization_rules "
            f"rows set Comorbidity_Tag (registry has {'such' if has_comorb_rule else 'no such active'} rows)."
        )
    if norm.prior_response_norm:
        has_pr_rule = any((r.get("Prior_Response_Tag") or "").strip() for r in personalization_rules)
        rationale.append(
            "prior_response recorded; structured prior-response matching applies only when personalization_rules "
            f"rows set Prior_Response_Tag (registry has {'such' if has_pr_rule else 'no such active'} rows)."
        )

    return PersonalizationRankingResult(
        chosen=chosen,
        ranking_factors_applied=factors,
        protocol_ranking_rationale=rationale,
        structured_rules_applied=[f.rule_id for f in chosen_fires],
        structured_rule_labels_applied=[f.rationale_label for f in chosen_fires if f.rationale_label],
        structured_rule_score_total=structured_by_pid.get(chosen_id, 0),
        structured_rule_matches_by_protocol=fires_by_pid,
        csv_baseline_protocol_id=baseline["Protocol_ID"],
        csv_baseline_protocol_name=baseline.get("Protocol_Name", ""),
        personalization_changed_vs_csv_first=chosen["Protocol_ID"] != baseline["Protocol_ID"],
        structured_score_by_protocol=dict(structured_by_pid),
        token_fallback_used=use_token_fallback,
        ranked_protocol_ids=ranked_ids,
    )


def _baseline_csv_first(eligible: list[dict[str, str]], protocol_file_index: dict[str, int]) -> dict[str, str]:
    return min(eligible, key=lambda p: protocol_file_index.get(p["Protocol_ID"], 999))


def resolve_failed_modality_ids(
    failed_strings: list[str],
    modality_rows: list[dict[str, str]],
) -> set[str]:
    from app.services.clinical_data import _modality_key

    by_key = {_modality_key(m["Modality_Name"]): m["Modality_ID"] for m in modality_rows}
    out: set[str] = set()
    for raw in failed_strings:
        key = _modality_key(raw.strip())
        mid = by_key.get(key)
        if mid:
            out.add(mid)
    return out


def build_protocol_file_index(protocols_table: list[dict[str, str]]) -> dict[str, int]:
    return {p["Protocol_ID"]: i for i, p in enumerate(protocols_table)}


def build_phenotypes_by_id(bundle_tables: dict[str, list[dict[str, str]]]) -> dict[str, dict[str, str]]:
    return {p["Phenotype_ID"]: p for p in bundle_tables["phenotypes"]}


def _tag_fingerprint(rule: dict[str, str]) -> frozenset[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for col, key in (
        ("Phenotype_Tag", "pheno"),
        ("QEEG_Tag", "qeeg"),
        ("Comorbidity_Tag", "comorb"),
        ("Prior_Response_Tag", "prior"),
    ):
        v = (rule.get(col) or "").strip()
        if v:
            out.append((key, v))
    return frozenset(out)


def diagnose_personalization_rules(rules: list[dict[str, str]]) -> dict[str, list[str]]:
    """Conservative static analysis of personalization_rules.csv (audit; not a clinical validator).

    Categories are informational. CI may assert subsets are empty for shipped data.
    """
    out: dict[str, list[str]] = {
        "duplicates": [],
        "conflicting_deltas": [],
        "parallel_competing_targets": [],
        "shadow_candidates": [],
        "invalid_empty_match": [],
    }
    active = [r for r in rules if _is_active_flag(r.get("Active", ""))]

    def _sig_trigger(r: dict[str, str]) -> tuple[str, ...]:
        return (
            r.get("Condition_ID", "").strip(),
            (r.get("Modality_ID") or "").strip(),
            (r.get("Device_ID") or "").strip(),
            (r.get("Phenotype_Tag") or "").strip(),
            (r.get("QEEG_Tag") or "").strip(),
            (r.get("Comorbidity_Tag") or "").strip(),
            (r.get("Prior_Response_Tag") or "").strip(),
        )

    for r in active:
        if not _tag_fingerprint(r):
            out["invalid_empty_match"].append(
                f"{r.get('Rule_ID', '?')}: active rule has no Phenotype_Tag, QEEG_Tag, Comorbidity_Tag, or Prior_Response_Tag."
            )

    # Duplicates: same trigger + same target + same delta
    from collections import defaultdict

    dup_bucket: dict[tuple[tuple[str, ...], str, int], list[str]] = defaultdict(list)
    for r in active:
        try:
            d = int((r.get("Score_Delta") or "0").strip())
        except ValueError:
            continue
        key = (_sig_trigger(r), (r.get("Preferred_Protocol_ID") or "").strip(), d)
        dup_bucket[key].append(r.get("Rule_ID", "").strip())

    for _k, ids in sorted(dup_bucket.items(), key=lambda x: x[0]):
        ids_u = sorted({i for i in ids if i})
        if len(ids_u) > 1:
            out["duplicates"].append(
                "Duplicate active rules (same match key, Preferred_Protocol_ID, Score_Delta): " + ", ".join(ids_u)
            )

    # Conflicting deltas: same trigger + same target, different delta
    cd_bucket: dict[tuple[tuple[str, ...], str], list[tuple[str, int]]] = defaultdict(list)
    for r in active:
        try:
            d = int((r.get("Score_Delta") or "0").strip())
        except ValueError:
            continue
        key = (_sig_trigger(r), (r.get("Preferred_Protocol_ID") or "").strip())
        cd_bucket[key].append((r.get("Rule_ID", "").strip(), d))

    for _k, pairs in sorted(cd_bucket.items(), key=lambda x: x[0]):
        deltas = {p[1] for p in pairs}
        if len(deltas) > 1:
            ids = sorted({p[0] for p in pairs if p[0]})
            out["conflicting_deltas"].append(
                f"Same match key and Preferred_Protocol_ID but different Score_Delta: {', '.join(ids)}"
            )

    # Parallel: same trigger, different Preferred_Protocol_ID
    par_bucket: dict[tuple[str, ...], set[str]] = defaultdict(set)
    for r in active:
        try:
            int((r.get("Score_Delta") or "0").strip())
        except ValueError:
            continue
        tk = _sig_trigger(r)
        par_bucket[tk].add((r.get("Preferred_Protocol_ID") or "").strip())

    for tk, prefs in sorted(par_bucket.items(), key=lambda x: x[0]):
        pref_list = {p for p in prefs if p}
        if len(pref_list) > 1:
            out["parallel_competing_targets"].append(
                f"Same match key {tk} boosts multiple protocols: {', '.join(sorted(pref_list))}"
            )

    # Shadow heuristic: same Condition/Modality/Device/Preferred, stricter tag superset, lower delta
    by_scope: dict[tuple[str, str, str, str], list[dict[str, str]]] = defaultdict(list)
    for r in active:
        try:
            d = int((r.get("Score_Delta") or "0").strip())
        except ValueError:
            continue
        scope = (
            r.get("Condition_ID", "").strip(),
            (r.get("Modality_ID") or "").strip(),
            (r.get("Device_ID") or "").strip(),
            (r.get("Preferred_Protocol_ID") or "").strip(),
        )
        by_scope[scope].append(r)

    for scope, rlist in by_scope.items():
        for i, a in enumerate(rlist):
            fpa = _tag_fingerprint(a)
            try:
                da = int((a.get("Score_Delta") or "0").strip())
            except ValueError:
                continue
            for b in rlist[i + 1 :]:
                fpb = _tag_fingerprint(b)
                try:
                    db = int((b.get("Score_Delta") or "0").strip())
                except ValueError:
                    continue
                for loose, strict, d_loose, d_strict, id_loose, id_strict in (
                    (fpa, fpb, da, db, a.get("Rule_ID"), b.get("Rule_ID")),
                    (fpb, fpa, db, da, b.get("Rule_ID"), a.get("Rule_ID")),
                ):
                    if not loose or not strict:
                        continue
                    if loose < strict and d_loose >= d_strict:
                        out["shadow_candidates"].append(
                            f"{id_strict} requires a strict superset of tags vs {id_loose} for {scope} "
                            f"but does not add a higher Score_Delta ({d_strict} vs {d_loose}); review redundancy."
                        )
                        break

    return out
