type RiskScores = {
  depression: number;
  anxiety: number;
  stress: number;
  confidence: number;
};

type RiskScoreCardProps = {
  risk?: RiskScores;
};

export function RiskScoreCard({ risk }: RiskScoreCardProps) {
  // TODO: 3 gauges (depression / anxiety / stress) with confidence band; decision-support disclaimer.
  return (
    <section className="rounded border p-4">
      <h2 className="text-lg font-medium">Risk scores (decision-support only)</h2>
      <p>
        {risk
          ? `D ${risk.depression} · A ${risk.anxiety} · S ${risk.stress}`
          : "Awaiting analysis…"}
      </p>
    </section>
  );
}
