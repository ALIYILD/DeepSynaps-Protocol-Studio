import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`app-surface rounded-3xl p-5 ${className}`}>{children}</section>;
}
