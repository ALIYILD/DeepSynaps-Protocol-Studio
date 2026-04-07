export function SearchInput({
  value,
  onChange,
  placeholder = "Search protocols, handbooks, evidence notes",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 cursor-text">
      <svg
        aria-hidden="true"
        className="flex-shrink-0 text-[var(--text-muted)]"
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <input
        aria-label="Global search"
        className="w-full border-0 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
          onClick={() => onChange("")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </label>
  );
}
