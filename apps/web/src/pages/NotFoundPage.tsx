import { Link } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-2xl">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">Route available</p>
      <h1 className="mt-4 font-display text-3xl text-[var(--text)]">This workspace view does not exist.</h1>
      <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
        The MVP keeps all navigation inside a bounded static workspace with no empty screens or broken paths.
      </p>
      <div className="mt-6">
        <Link to="/">
          <Button>Return to dashboard</Button>
        </Link>
      </div>
    </Card>
  );
}
