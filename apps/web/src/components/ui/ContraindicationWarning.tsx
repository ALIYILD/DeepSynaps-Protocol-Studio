export function ContraindicationWarning({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="rounded-3xl border border-red-500/40 bg-red-500/10 p-4">
      <div className="flex items-center gap-2">
        <svg
          aria-hidden="true"
          className="h-5 w-5 flex-shrink-0 text-red-400"
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
        <h3 className="font-display text-base font-bold text-red-400">
          Contraindications
        </h3>
      </div>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-red-300">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
