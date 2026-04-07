import { Card } from "../ui/Card";
import { PROFESSIONAL_USE_ONLY } from "../../content/disclaimers";

export function DisclaimerBanner() {
  return (
    <Card className="border-l-4 border-l-[var(--accent)]">
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--accent)]">Professional boundary</p>
      <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
        {PROFESSIONAL_USE_ONLY} DeepSynaps Studio supports evidence-based assessments, protocols,
        handbooks, and clinician-gated upload review.
      </p>
    </Card>
  );
}
