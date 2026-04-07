import { roleProfiles, workspaceAlerts } from "../../data/mockData";
import { useAppDispatch, useAppState } from "../../app/useAppStore";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SearchInput } from "../ui/SearchInput";

export function TopBar() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const visibleAlerts = workspaceAlerts.filter((alert) => state.unreadNotifications.includes(alert.id));

  return (
    <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 xl:flex-row xl:items-center">
      <SearchInput
        value={state.searchQuery}
        onChange={(value) => dispatch({ type: "set_search", value })}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="soft-panel flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
          <span className="text-[var(--text-muted)]">Role</span>
          <select
            aria-label="Role switcher"
            className="bg-transparent text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 rounded"
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
        </label>

        <Button variant="secondary" onClick={() => dispatch({ type: "toggle_theme" })}>
          {state.theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>

        <div className="relative">
          <Button variant="secondary" onClick={() => dispatch({ type: "toggle_notifications" })}>
            Notifications
          </Button>
          {visibleAlerts.length > 0 ? (
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[var(--accent)]" />
          ) : null}
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
                        className="mt-3 text-sm text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 rounded focus-visible:outline-none"
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

        <div className="relative">
          <Button variant="ghost" onClick={() => dispatch({ type: "toggle_profile_menu" })}>
            Profile
          </Button>
          {state.profileMenuOpen ? (
            <div className="soft-panel absolute right-0 z-20 mt-2 w-[min(16rem,calc(100vw-2rem))] rounded-2xl p-4">
              <p className="font-display text-lg text-[var(--text)]">DeepSynaps profile</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Active role: {roleProfiles.find((profile) => profile.role === state.role)?.label}
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
                This static MVP keeps role state in memory only. No personal data is persisted.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
