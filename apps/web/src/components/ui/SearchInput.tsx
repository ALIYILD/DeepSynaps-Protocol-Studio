export function SearchInput({
  value,
  onChange,
  placeholder = "Search conditions, devices, protocols...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3.5 py-2 cursor-text transition-colors"
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
      }}
    >
      <svg
        aria-hidden="true"
        className="flex-shrink-0"
        style={{ color: "var(--text-muted)" }}
        width="15"
        height="15"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.75" />
        <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <input
        aria-label="Global search"
        className="w-full border-0 bg-transparent text-sm outline-none"
        style={{ color: "var(--text)" }}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="flex-shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{ color: "var(--text-muted)" }}
          onClick={() => onChange("")}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </label>
  );
}
