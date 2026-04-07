import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { featureMatrix } from "../data/mockData";
import {
  PACKAGE_ORDER,
  PACKAGES,
  PackageTier,
  formatPrice,
  formatSeatLimit,
} from "../lib/packages";

function PriceDisplay({ pkg }: { pkg: PackageTier }) {
  const price = formatPrice(pkg);
  const annualNote =
    pkg.annualPriceUsd && pkg.annualPriceUsd > 0
      ? `$${pkg.annualPriceUsd} / year`
      : null;

  return (
    <div className="mt-3">
      <p className="text-3xl font-semibold text-[var(--accent)]">{price}</p>
      {annualNote && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{annualNote} billed annually</p>
      )}
    </div>
  );
}

function SeatBadge({ pkg }: { pkg: PackageTier }) {
  const label = formatSeatLimit(pkg);
  return (
    <span className="text-xs text-[var(--text-muted)]">{label}</span>
  );
}

function AddonNote({ pkg }: { pkg: PackageTier }) {
  if (pkg.addonEligible.length === 0) return null;
  return (
    <p className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
      Add-on available: Phenotype mapping
    </p>
  );
}

export function PricingAccessPage() {
  const packages = PACKAGE_ORDER.map((id) => PACKAGES[id]);

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="💳"
        eyebrow="Pricing / Access"
        title="Plans for every stage of practice"
        description="DeepSynaps Studio is available across five tiers — from free exploration to enterprise deployment. Governance and evidence restrictions apply regardless of plan."
      />

      <InfoNotice
        title="Governance notice"
        body="EV-D evidence is always blocked from patient-facing exports. Off-label protocols always require clinical review. These restrictions are independent of your plan tier and cannot be unlocked by upgrading."
      />

      {/* Package cards */}
      <div className="grid gap-4 xl:grid-cols-5">
        {packages.map((pkg) => (
          <Card key={pkg.id}>
            {pkg.enterprise && (
              <Badge tone="warning">Enterprise</Badge>
            )}
            {!pkg.enterprise && pkg.monthlyPriceUsd === 0 && (
              <Badge tone="neutral">Free</Badge>
            )}
            {!pkg.enterprise && pkg.monthlyPriceUsd > 0 && (
              <Badge tone="accent">Professional</Badge>
            )}
            <h2 className="mt-4 font-display text-xl text-[var(--text)]">{pkg.displayName}</h2>
            <PriceDisplay pkg={pkg} />
            <p className="mt-3 text-xs text-[var(--text-muted)]">{pkg.bestFor}</p>
            <div className="mt-3">
              <SeatBadge pkg={pkg} />
            </div>
            <AddonNote pkg={pkg} />
            {pkg.enterprise && (
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Starting from $2,500 / month. Contact us for custom pricing.
              </p>
            )}
          </Card>
        ))}
      </div>

      {/* Feature comparison matrix */}
      <Card className="overflow-x-auto">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Feature comparison
        </h3>
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <th className="pb-2 pr-4">Feature</th>
              {packages.map((pkg) => (
                <th key={pkg.id} className="pb-2 pr-4">
                  {pkg.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureMatrix.map((row) => (
              <tr key={row.feature} className="soft-panel">
                <td className="rounded-l-2xl px-4 py-3 text-sm font-medium text-[var(--text)]">
                  {row.feature}
                </td>
                {packages.map((pkg, index) => {
                  const value = row.availability[pkg.displayName as keyof typeof row.availability];
                  const isNotIncluded = value === "Not included";
                  return (
                    <td
                      key={`${row.feature}-${pkg.id}`}
                      className={`px-4 py-3 text-sm ${
                        index === packages.length - 1 ? "rounded-r-2xl" : ""
                      } ${isNotIncluded ? "text-[var(--text-muted)] opacity-50" : "text-[var(--text)]"}`}
                    >
                      {value ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Enterprise CTA */}
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-display text-lg text-[var(--text)]">Enterprise and custom deployments</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Custom seat limits, advanced governance rules, full white-label branding, API access,
              SSO-ready structure, and data residency options. Starting from $2,500 / month.
            </p>
          </div>
          <div className="shrink-0">
            <span className="inline-block rounded-lg border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--text)]">
              Contact sales
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
