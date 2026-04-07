import { Link } from "react-router-dom";

import { usePackage } from "../../app/useAppStore";
import { Feature, PACKAGES, minimumPackageFor } from "../../lib/packages";
import { Card } from "../ui/Card";

/**
 * Shown when a feature is not included in the current package.
 * Displays the minimum required plan and links to the pricing page.
 */
export function UpgradePrompt({ feature }: { feature: Feature }) {
  const { packageId } = usePackage();
  const currentPkg = PACKAGES[packageId];
  const requiredPkg = minimumPackageFor(feature);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Plan upgrade required
          </span>
        </div>
        <h2 className="font-display text-xl text-[var(--text)]">
          This feature is not included in your current plan
        </h2>
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          You are on the <span className="font-medium text-[var(--text)]">{currentPkg.displayName}</span> plan.
          {requiredPkg ? (
            <>
              {" "}
              <span className="font-medium text-[var(--accent)]">{requiredPkg.displayName}</span> or higher
              is required to access this feature.
            </>
          ) : (
            " This feature is available on a higher plan."
          )}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Note: Governance and evidence restrictions still apply regardless of plan tier.
        </p>
        <div className="mt-2">
          <Link
            to="/pricing-access"
            className="inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Compare plans
          </Link>
        </div>
      </div>
    </Card>
  );
}
