export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-3">
      <span aria-hidden="true" className="text-[var(--accent)]">
        Search
      </span>
      <input
        aria-label="Global search"
        className="w-full border-0 bg-transparent text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 rounded-lg placeholder:text-[var(--text-muted)]"
        placeholder="Search protocols, handbooks, evidence notes"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
