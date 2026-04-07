import { ReactNode } from "react";

import { useAppState } from "../../app/useAppStore";
import { UserRole } from "../../types/domain";
import { Card } from "../ui/Card";

const hierarchy: Record<UserRole, number> = {
  guest: 0,
  clinician: 1,
  admin: 2,
};

export function RoleGate({
  minimumRole,
  title,
  description,
  children,
}: {
  minimumRole: UserRole;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { role } = useAppState();

  if (hierarchy[role] >= hierarchy[minimumRole]) {
    return <>{children}</>;
  }

  return (
    <Card>
      <h2 className="font-display text-xl text-[var(--text)]">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
    </Card>
  );
}
