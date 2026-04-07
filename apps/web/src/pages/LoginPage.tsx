import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppDispatch } from "../app/useAppStore";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { loginUser, registerUser } from "../lib/api/services";
import { UserRole } from "../types/domain";

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  function applyAuthResult(result: {
    access_token: string;
    refresh_token: string;
    user: { role: string; display_name: string };
  }) {
    localStorage.setItem("access_token", result.access_token);
    localStorage.setItem("refresh_token", result.refresh_token);
    localStorage.setItem("jwt_display_name", result.user.display_name);

    const role = result.user.role as UserRole;
    if (role === "guest" || role === "clinician" || role === "admin") {
      dispatch({ type: "set_role", role });
    }

    navigate("/");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginUser({ email, password });
      applyAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await registerUser({ email, display_name: displayName, password });
      applyAuthResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--accent)]">DeepSynaps Studio</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-[var(--text)]">
            Clinical neuromodulation knowledge platform
          </h1>
        </div>

        <Card className="p-6">
          {/* Tab switcher */}
          <div className="flex rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1 mb-6">
            <button
              type="button"
              onClick={() => { setTab("login"); setError(null); }}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                tab === "login"
                  ? "bg-[var(--bg-strong)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setTab("register"); setError(null); }}
              className={`flex-1 rounded-xl py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                tab === "register"
                  ? "bg-[var(--bg-strong)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Create Account
            </button>
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="login-email" className="text-sm font-medium text-[var(--text)]">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition"
                  placeholder="you@example.com"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="login-password" className="text-sm font-medium text-[var(--text)]">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition"
                  placeholder="••••••••"
                />
              </div>

              {error ? (
                <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  {error}
                </p>
              ) : null}

              <Button type="submit" variant="primary" disabled={loading} className="w-full mt-1">
                {loading ? "Signing in..." : "Sign In"}
              </Button>

              <p className="text-center text-sm text-[var(--text-muted)]">
                No account?{" "}
                <button
                  type="button"
                  onClick={() => { setTab("register"); setError(null); }}
                  className="text-[var(--accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
                >
                  Create Account
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="grid gap-4">
              <div className="grid gap-1.5">
                <label htmlFor="reg-email" className="text-sm font-medium text-[var(--text)]">
                  Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition"
                  placeholder="you@example.com"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="reg-display-name" className="text-sm font-medium text-[var(--text)]">
                  Display name
                </label>
                <input
                  id="reg-display-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition"
                  placeholder="Dr. Jane Smith"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="reg-password" className="text-sm font-medium text-[var(--text)]">
                  Password
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] transition"
                  placeholder="Min. 8 characters"
                />
                <p className="text-xs text-[var(--text-muted)]">Minimum 8 characters</p>
              </div>

              {error ? (
                <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  {error}
                </p>
              ) : null}

              <Button type="submit" variant="primary" disabled={loading} className="w-full mt-1">
                {loading ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          Demo access: use demo token selector in the app
        </p>
      </div>
    </div>
  );
}
