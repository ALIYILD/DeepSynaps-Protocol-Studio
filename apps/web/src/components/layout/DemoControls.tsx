import { useState } from "react";

import { roleProfiles } from "../../data/mockData";
import { useAppDispatch, useAppState } from "../../app/useAppStore";

export function DemoControls() {
  const jwtToken = localStorage.getItem("access_token");
  const [open, setOpen] = useState(false);
  const state = useAppState();
  const dispatch = useAppDispatch();

  // Only show in demo mode (no JWT)
  if (jwtToken) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div
          className="rounded-2xl border border-[var(--border)] shadow-lg p-4 mb-2 min-w-[200px]"
          style={{ background: "var(--bg-strong)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Demo Controls
            </p>
            <button
              className="text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
              onClick={() => setOpen(false)}
              aria-label="Close demo controls"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Role</label>
          <select
            aria-label="Demo role switcher"
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            value={state.role}
            onChange={(event) =>
              dispatch({ type: "set_role", role: event.target.value as (typeof roleProfiles)[number]["role"] })
            }
          >
            {roleProfiles.map((profile) => (
              <option key={profile.role} value={profile.role}>
                {profile.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <button
        className="flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium shadow-lg transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ background: "var(--bg-strong)", color: "var(--text-muted)" }}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Toggle demo controls"
      >
        <span
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ background: "var(--accent)" }}
          aria-hidden="true"
        />
        Demo: {roleProfiles.find((p) => p.role === state.role)?.label ?? "Guest"}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
