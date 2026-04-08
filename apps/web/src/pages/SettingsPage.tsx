import { useState } from "react";

import { useAppDispatch, useAppState } from "../app/useAppStore";
import { getTelegramLinkCode, sendTelegramTest } from "../lib/api/services";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";

const CARD_STYLE = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-sm)",
};

const LOCKED_ROWS: { label: string; value: string }[] = [
  { label: "Language", value: "English (UK)" },
  { label: "Date format", value: "DD/MM/YYYY" },
  { label: "Timezone", value: "Europe/London" },
];

type NotificationKey = "session_reminders" | "protocol_updates" | "new_documents" | "system_alerts";

const NOTIFICATIONS: { key: NotificationKey; label: string; description: string }[] = [
  { key: "session_reminders", label: "Session reminders", description: "Get notified before upcoming sessions are due." },
  { key: "protocol_updates", label: "Protocol updates", description: "Alerts when a protocol you use receives new evidence." },
  { key: "new_documents", label: "New patient documents", description: "Notified when a document is added to a patient's record." },
  { key: "system_alerts", label: "System alerts", description: "Platform maintenance and important system messages." },
];

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{ color: "var(--text-subtle)" }}>
      <rect x="2.5" y="5.5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4.5 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent)]"
      style={{
        background: on ? "var(--accent)" : "var(--border)",
      }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 rounded-full shadow-sm transition-transform"
        style={{
          background: "white",
          transform: on ? "translateX(1.1rem)" : "translateX(0.125rem)",
          marginTop: "0.125rem",
        }}
      />
    </button>
  );
}

function getInitials(role: string): string {
  if (role === "admin") return "DA";
  if (role === "clinician") return "CD";
  return "GU";
}

function getDisplayName(role: string): string {
  if (role === "admin") return "Dr. Admin";
  if (role === "clinician") return "Clinician Demo";
  return "Guest User";
}

type BadgeToneSubset = "accent" | "success" | "neutral";

function getRoleBadgeTone(role: string): BadgeToneSubset {
  if (role === "admin") return "accent";
  if (role === "clinician") return "success";
  return "neutral";
}

export function SettingsPage() {
  const { role, theme } = useAppState();
  const dispatch = useAppDispatch();

  const [notifications, setNotifications] = useState<Record<NotificationKey, boolean>>({
    session_reminders: true,
    protocol_updates: true,
    new_documents: true,
    system_alerts: true,
  });

  const toggleNotification = (key: NotificationKey) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Telegram state
  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [telegramExpiry, setTelegramExpiry] = useState<number | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleGetLinkCode() {
    setLinkLoading(true);
    setLinkError(null);
    setTelegramCode(null);
    setTelegramExpiry(null);
    setTestFeedback(null);
    try {
      const result = await getTelegramLinkCode();
      setTelegramCode(result.code);
      setTelegramExpiry(result.expires_in_seconds);
    } catch {
      setLinkError("Could not fetch a link code. Please try again.");
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleSendTest() {
    setTestLoading(true);
    setTestFeedback(null);
    try {
      const result = await sendTelegramTest();
      setTestFeedback(
        result.sent
          ? { ok: true, message: "Test message sent successfully." }
          : { ok: false, message: "Message was not delivered. Check your Telegram link." }
      );
    } catch {
      setTestFeedback({ ok: false, message: "Failed to send test message. Please try again." });
    } finally {
      setTestLoading(false);
    }
  }

  const initials = getInitials(role);
  const displayName = getDisplayName(role);
  const roleTone = getRoleBadgeTone(role);
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className="grid gap-7 max-w-2xl">
      <PageHeader
        icon="⚙️"
        eyebrow="Settings"
        title="Settings"
        description="Manage your account, preferences, and workspace configuration."
      />

      {/* Profile card */}
      <section>
        <h2 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
          Profile
        </h2>
        <div className="rounded-xl p-5 flex flex-col gap-5" style={CARD_STYLE}>
          {/* Avatar + role */}
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl font-display font-bold text-lg"
              style={{
                background: "var(--accent-soft)",
                border: "2px solid var(--accent-soft-border)",
                color: "var(--accent)",
              }}
              aria-label={`Avatar for ${displayName}`}
            >
              {initials}
            </div>
            <div>
              <p className="font-display font-semibold text-base" style={{ color: "var(--text)" }}>
                {displayName}
              </p>
              <div className="mt-1">
                <Badge tone={roleTone}>{roleLabel}</Badge>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Display name
              </label>
              <input
                type="text"
                readOnly
                value={displayName}
                className="rounded-lg px-3 py-2 text-sm outline-none cursor-not-allowed"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  opacity: 0.7,
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Email
              </label>
              <input
                type="email"
                readOnly
                value="demo@deepsynaps.com"
                className="rounded-lg px-3 py-2 text-sm outline-none cursor-not-allowed"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  opacity: 0.7,
                }}
              />
            </div>
          </div>

          <div className="pt-1 border-t flex justify-end" style={{ borderColor: "var(--border)" }}>
            <Button variant="secondary" size="sm" disabled title="Coming soon">
              Edit Profile
            </Button>
          </div>
        </div>
      </section>

      {/* Preferences card */}
      <section>
        <h2 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
          Preferences
        </h2>
        <div className="rounded-xl p-5 flex flex-col gap-4" style={CARD_STYLE}>
          {/* Theme toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Theme</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Currently {theme === "dark" ? "Dark" : "Light"} mode
              </p>
            </div>
            <button
              onClick={() => dispatch({ type: "toggle_theme" })}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-soft-border)",
                color: "var(--accent)",
              }}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
              <span style={{ color: "var(--text-subtle)", marginLeft: 4 }}>Switch</span>
            </button>
          </div>

          <div
            className="border-t"
            style={{ borderColor: "var(--border)" }}
          />

          {/* Locked preference rows */}
          {LOCKED_ROWS.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <p className="text-sm" style={{ color: "var(--text)" }}>{row.label}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                  {row.value}
                </span>
                <LockIcon />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Notifications card */}
      <section>
        <h2 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
          Notifications
        </h2>
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {NOTIFICATIONS.map((n) => (
              <li key={n.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{n.label}</p>
                  <p className="text-xs mt-0.5 leading-4" style={{ color: "var(--text-muted)" }}>
                    {n.description}
                  </p>
                </div>
                <Toggle
                  on={notifications[n.key]}
                  onToggle={() => toggleNotification(n.key)}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Telegram Notifications card */}
      <section>
        <h2 className="font-display text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>
          ✈️ Telegram Notifications
        </h2>
        <div className="rounded-xl p-5 flex flex-col gap-4" style={CARD_STYLE}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Link your Telegram account to receive session reminders and patient alerts.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGetLinkCode}
              disabled={linkLoading}
            >
              {linkLoading ? "Fetching…" : "Get Link Code"}
            </Button>

            {telegramCode && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSendTest}
                disabled={testLoading}
              >
                {testLoading ? "Sending…" : "Send Test Message"}
              </Button>
            )}
          </div>

          {linkError && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ color: "var(--danger, #e53e3e)", background: "var(--danger-soft, #fff5f5)", border: "1px solid var(--danger-border, #fed7d7)" }}>
              {linkError}
            </p>
          )}

          {telegramCode && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Open Telegram, find <span style={{ color: "var(--accent)" }}>@DeepSynapsBot</span>, and send:
              </p>
              <div
                className="rounded-lg px-4 py-3 font-mono text-sm select-all"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary, var(--text))",
                  letterSpacing: "0.02em",
                }}
              >
                /link {telegramCode}
              </div>
              {telegramExpiry !== null && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  This code expires in {telegramExpiry} seconds. Do not share it.
                </p>
              )}
            </div>
          )}

          {testFeedback && (
            <p
              className="text-xs rounded-lg px-3 py-2"
              style={{
                color: testFeedback.ok ? "var(--success, #276749)" : "var(--danger, #e53e3e)",
                background: testFeedback.ok ? "var(--success-soft, #f0fff4)" : "var(--danger-soft, #fff5f5)",
                border: `1px solid ${testFeedback.ok ? "var(--success-border, #c6f6d5)" : "var(--danger-border, #fed7d7)"}`,
              }}
            >
              {testFeedback.message}
            </p>
          )}
        </div>
      </section>

      {/* Footer */}
      <p className="text-xs pb-4" style={{ color: "var(--text-subtle)" }}>
        DeepSynaps Protocol Studio · Settings are saved locally for this session.
      </p>
    </div>
  );
}
