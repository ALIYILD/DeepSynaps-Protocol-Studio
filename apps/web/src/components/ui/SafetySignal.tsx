export type SafetyStatus = "safe" | "warning" | "danger";

const config: Record<
  SafetyStatus,
  { icon: React.ReactNode; label: string; classes: string }
> = {
  safe: {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
    label: "Safe",
    classes: "text-[var(--success-text)] bg-[var(--success-bg)]",
  },
  warning: {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
    ),
    label: "Warning",
    classes: "text-[var(--warning-text)] bg-[var(--warning-bg)]",
  },
  danger: {
    icon: (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    ),
    label: "Danger",
    classes: "text-[var(--danger-text)] bg-[var(--danger-bg)]",
  },
};

export function SafetySignal({
  status,
  label,
}: {
  status: SafetyStatus;
  label?: string;
}) {
  const { icon, label: defaultLabel, classes } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}
    >
      {icon}
      {label ?? defaultLabel}
    </span>
  );
}
