import { ReactNode, useId } from "react";

export function SelectField({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();

  return (
    <div className="grid gap-2 text-sm">
      <label htmlFor={generatedId} className="text-[var(--text-muted)]">
        {label}
        {required ? <span className="ml-1 text-[var(--accent)]" aria-hidden="true">*</span> : null}
      </label>
      <select
        id={generatedId}
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-3 text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        disabled={disabled}
        required={required}
        aria-required={required ? "true" : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}
