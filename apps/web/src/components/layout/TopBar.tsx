import { Link } from "react-router-dom";

import { roleProfiles, workspaceAlerts } from "../../data/mockData";
import { useAppDispatch, useAppState } from "../../app/useAppStore";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SearchInput } from "../ui/SearchInput";

export function TopBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const visibleAlerts = workspaceAlerts.filter((alert) => state.unreadNotifications.includes(alert.id));
  const jwtToken = localStorage.getItem("access_token");
  const jwtDisplayName = localStorage.getItem("jwt_display_name");

  return (
    <header
      className="flex items-center gap-4 border-b border-[var(--border)]"
      style={{ minHeight: "60px", paddingBottom: "16px" }}
    >
      {/* Search — takes up available center space */}
      <div className="flex-1 max-w-xl">
        <SearchInput
          value={state.searchQuery}
          onChange={(value) => dispatch({ type: "set_search", value })}
          placeholder="Search conditions, devices, protocols..."
        />
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Theme toggle */}
        <Button variant="secondary" onClick={() => dispatch({ type: "toggle_theme" })}>
          {state.theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </Button>

        {/* Notification bell */}
        <div className="relative">
          <button
            className="relative inline-flex items-center justify-center rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none text-[var(--text-muted)]"
            onClick={() => dispatch({ type: "toggle_notifications" })}
            aria-label={`Notifications${visibleAlerts.length > 0 ? `, ${visibleAlerts.length} unread` : ""}`}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M10 2a6 6 0 0 0-6 6v3.17L2.5 13.5h15L16 11.17V8a6 6 0 0 0-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 16a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {visibleAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>
                {visibleAlerts.length}
              </span>
            )}
          </button>

          {state.notificationsOpen ? (
            <div className="soft-panel absolute right-0 z-20 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-[var(--text)]">Notifications</h2>
                <Badge tone="accent">{visibleAlerts.length}</Badge>
              </div>
              <ul className="mt-4 grid gap-3">
                {workspaceAlerts.map((alert) => (
                  <li key={alert.id} className="rounded-2xl border border-[var(--border)] p-3">
                    <p className="font-medium text-[var(--text)]">{alert.title}</p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{alert.body}</p>
                    {state.unreadNotifications.includes(alert.id) ? (
                      <button
                        className="mt-3 text-sm text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 rounded focus-visible:outline-none hover:underline"
                        onClick={() => dispatch({ type: "dismiss_notification", id: alert.id })}
                      >
                        Mark reviewed
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Login / Profile */}
        <div className="relative">
          {jwtToken ? (
            <>
              <Button variant="ghost" onClick={() => dispatch({ type: "toggle_profile_menu" })}>
                {jwtDisplayName ?? "Profile"}
              </Button>
              {state.profileMenuOpen ? (
                <div className="soft-panel absolute right-0 z-20 mt-2 w-[min(16rem,calc(100vw-2rem))] rounded-2xl p-4">
                  <p className="font-display text-lg text-[var(--text)]">DeepSynaps profile</p>
                  {jwtDisplayName ? (
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{jwtDisplayName}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Active role: {roleProfiles.find((profile) => profile.role === state.role)?.label}
                  </p>
                  <button
                    className="mt-4 text-sm text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                    onClick={() => {
                      localStorage.removeItem("access_token");
                      localStorage.removeItem("refresh_token");
                      localStorage.removeItem("jwt_display_name");
                      dispatch({ type: "set_role", role: "guest" });
                      dispatch({ type: "toggle_profile_menu" });
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 font-medium transition text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] text-sm border border-[var(--border)]"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
