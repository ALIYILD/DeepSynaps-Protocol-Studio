export function ContraindicationWarning({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="rounded-3xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4">
      <div className="flex items-center gap-2">
        <svg
          aria-hidden="true"
          className="h-5 w-5 flex-shrink-0 text-[var(--danger-text)]"
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
        <h3 className="font-display text-base font-bold text-[var(--danger-text)]">
          Contraindications
        </h3>
      </div>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--danger-text)]">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 opacity-90">
            <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--danger-text)]" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
