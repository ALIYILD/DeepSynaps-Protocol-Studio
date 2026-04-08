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
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={generatedId} className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
        {required ? <span className="ml-1 text-[var(--accent)]" aria-hidden="true">*</span> : null}
      </label>
      <select
        id={generatedId}
        className="rounded-xl px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
        }}
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
