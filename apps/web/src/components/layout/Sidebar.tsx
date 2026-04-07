import { NavLink } from "react-router-dom";

import { roleProfiles } from "../../data/mockData";
import { useAppState } from "../../app/useAppStore";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/evidence-library", label: "Evidence Library" },
  { to: "/device-registry", label: "Device Registry" },
  { to: "/brain-regions", label: "Brain Regions" },
  { to: "/qeeg-maps", label: "qEEG Maps" },
  { to: "/assessment-builder", label: "Assessment Builder" },
  { to: "/protocols", label: "Protocols" },
  { to: "/handbooks", label: "Handbooks" },
  { to: "/upload-review", label: "Upload Review" },
  { to: "/governance-safety", label: "Governance / Safety" },
  { to: "/pricing-access", label: "Pricing / Access" },
];

export function Sidebar() {
  const { role } = useAppState();
  const activeRole = roleProfiles.find((profile) => profile.role === role) ?? roleProfiles[0];

  return (
    <aside className="app-surface rounded-[2rem] p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
      <div className="border-b border-[var(--border)] pb-5">
        <p className="text-xs uppercase tracking-[0.32em] text-[var(--accent)]">DeepSynaps Studio</p>
        <h1 className="mt-4 font-display text-2xl font-semibold text-[var(--text)]">
          Clinical knowledge workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{activeRole.description}</p>
      </div>

      <nav className="mt-6" aria-label="Primary navigation">
        <ul className="grid gap-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `block rounded-2xl px-4 py-3 text-sm transition ${
                    isActive
                      ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
        <h2 className="font-display text-lg text-[var(--text)]">Role permissions</h2>
        <ul className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
          {activeRole.permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
