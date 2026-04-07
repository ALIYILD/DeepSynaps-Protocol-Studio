from deepsynaps_core_schema import DisclaimerSet


def standard_disclaimers(*, include_draft: bool = False, include_off_label: bool = False) -> DisclaimerSet:
    return DisclaimerSet(
        professional_use_only="For professional use only.",
        draft_support_only="Draft support only." if include_draft else None,
        clinician_judgment="Not a substitute for clinician judgment.",
        off_label_review_required=(
            "Off-label pathways require independent clinical review."
            if include_off_label
            else None
        ),
    )
