import { ReactNode } from "react";

export function SelectField({
  label,
  value,
  onChange,
  disabled = false,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <select
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-3 text-[var(--text)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
