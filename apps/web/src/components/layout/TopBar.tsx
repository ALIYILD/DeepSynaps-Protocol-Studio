import { Link } from "react-router-dom";

import { roleProfiles, workspaceAlerts } from "../../data/mockData";
import { useAppDispatch, useAppState } from "../../app/useAppStore";
import { Badge } from "../ui/Badge";
import { SearchInput } from "../ui/SearchInput";

export function TopBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const visibleAlerts = workspaceAlerts.filter((alert) => state.unreadNotifications.includes(alert.id));
  const jwtToken = localStorage.getItem("access_token");
  const jwtDisplayName = localStorage.getItem("jwt_display_name");

  return (
    <header
      className="flex items-center gap-3 pb-4"
      style={{ borderBottom: "1px solid var(--border)", minHeight: "56px" }}
    >
      {/* Search */}
      <div className="flex-1 max-w-md">
        <SearchInput
          value={state.searchQuery}
          onChange={(value) => dispatch({ type: "set_search", value })}
          placeholder="Search conditions, protocols..."
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Theme toggle */}
        <button
          className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            background: "var(--bg-elevated)",
          }}
          onClick={() => dispatch({ type: "toggle_theme" })}
          title={state.theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {state.theme === "dark" ? (
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.75" />
              <path d="M10 2V4M10 16V18M2 10H4M16 10H18M4.22 4.22L5.64 5.64M14.36 14.36L15.78 15.78M4.22 15.78L5.64 14.36M14.36 5.64L15.78 4.22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M17.5 11.3A7.5 7.5 0 1 1 8.7 2.5a5.83 5.83 0 0 0 8.8 8.8Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            className="relative inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}
            onClick={() => dispatch({ type: "toggle_notifications" })}
            aria-label={`Notifications${visibleAlerts.length > 0 ? `, ${visibleAlerts.length} unread` : ""}`}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M10 2a6 6 0 0 0-6 6v3.17L2.5 13.5h15L16 11.17V8a6 6 0 0 0-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 16a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {visibleAlerts.length > 0 && (
              <span
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {visibleAlerts.length}
              </span>
            )}
          </button>

          {state.notificationsOpen ? (
            <div
              className="soft-panel absolute right-0 z-20 mt-2 w-72 rounded-xl p-4"
              style={{ boxShadow: "var(--shadow-lg)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold text-[var(--text)]">Notifications</h2>
                {visibleAlerts.length > 0 && <Badge tone="accent">{visibleAlerts.length}</Badge>}
              </div>
              <ul className="grid gap-2">
                {workspaceAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded-xl p-3"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    <p className="font-medium text-sm text-[var(--text)]">{alert.title}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)] leading-5">{alert.body}</p>
                    {state.unreadNotifications.includes(alert.id) ? (
                      <button
                        className="mt-2 text-xs font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:underline"
                        style={{ color: "var(--accent)" }}
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

        {/* Auth */}
        <div className="relative">
          {jwtToken ? (
            <>
              <button
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                }}
                onClick={() => dispatch({ type: "toggle_profile_menu" })}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold"
                  style={{ background: "var(--accent)" }}
                >
                  {(jwtDisplayName ?? "U")[0].toUpperCase()}
                </span>
                <span className="max-w-[100px] truncate">{jwtDisplayName ?? "Profile"}</span>
              </button>
              {state.profileMenuOpen ? (
                <div
                  className="soft-panel absolute right-0 z-20 mt-2 w-56 rounded-xl p-4"
                  style={{ boxShadow: "var(--shadow-lg)" }}
                >
                  <p className="font-semibold text-sm text-[var(--text)]">{jwtDisplayName}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {roleProfiles.find((p) => p.role === state.role)?.label}
                  </p>
                  <button
                    className="mt-4 text-xs font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                    style={{ color: "var(--danger-text)" }}
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
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{
                background: "var(--accent)",
                color: "white",
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
