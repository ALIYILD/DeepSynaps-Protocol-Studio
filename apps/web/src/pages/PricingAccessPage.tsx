import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { PageHeader } from "../components/ui/PageHeader";
import { featureMatrix, pricingTiers } from "../data/mockData";

export function PricingAccessPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Pricing / Access"
        title="Access models for professional users"
        description="A commercial view of workspace access levels across exploration, clinician use, team operations, and enterprise collaboration."
      />
      <div className="grid gap-4 xl:grid-cols-4">
        {pricingTiers.map((tier) => (
          <Card key={tier.id}>
            <Badge tone="accent">{tier.audience}</Badge>
            <h2 className="mt-4 font-display text-2xl text-[var(--text)]">{tier.name}</h2>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{tier.price.replace("Â£", "GBP ")}</p>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{tier.description}</p>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-[var(--text-muted)]">
              {tier.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <th>Feature</th>
              {pricingTiers.map((tier) => (
                <th key={tier.id}>{tier.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureMatrix.map((row) => (
              <tr key={row.feature} className="soft-panel">
                <td className="rounded-l-2xl px-4 py-4 font-medium text-[var(--text)]">{row.feature}</td>
                {pricingTiers.map((tier, index) => (
                  <td
                    key={`${row.feature}-${tier.id}`}
                    className={`px-4 py-4 text-sm text-[var(--text-muted)] ${
                      index === pricingTiers.length - 1 ? "rounded-r-2xl" : ""
                    }`}
                  >
                    {row.availability[tier.name]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
