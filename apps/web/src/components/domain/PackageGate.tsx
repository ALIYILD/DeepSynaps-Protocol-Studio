import { ReactNode } from "react";

import { usePackage } from "../../app/useAppStore";
import { Feature } from "../../lib/packages";
import { UpgradePrompt } from "./UpgradePrompt";

/**
 * Renders children when the current package includes the given feature (or any of `anyOf`).
 * Falls back to UpgradePrompt (or a custom fallback) otherwise.
 *
 * Use `anyOf` when a feature area has tiered variants (e.g. generate_limited vs generate).
 *
 * Clinical governance restrictions are enforced separately and are not
 * affected by which package is active.
 */
export function PackageGate({
  feature,
  anyOf,
  children,
  fallback,
}: {
  feature?: Feature;
  anyOf?: Feature[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasFeature } = usePackage();

  const hasAccess = anyOf
    ? anyOf.some((f) => hasFeature(f))
    : feature !== undefined && hasFeature(feature);

  if (hasAccess) {
    return <>{children}</>;
  }

  const promptFeature = anyOf?.[0] ?? feature;
  return <>{fallback ?? (promptFeature ? <UpgradePrompt feature={promptFeature} /> : null)}</>;
}
