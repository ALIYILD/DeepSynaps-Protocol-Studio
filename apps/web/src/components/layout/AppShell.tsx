import { Outlet } from "react-router-dom";

import { DemoControls } from "./DemoControls";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <div className="min-h-screen p-3 md:p-4" style={{ background: "var(--bg)" }}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Sidebar />

        {/* Main content panel */}
        <div
          className="flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="px-6 pt-4 pb-0">
            <TopBar />
          </div>
          <main id="main-content" className="flex-1 px-6 py-6">
            <Outlet />
          </main>
        </div>
      </div>

      <DemoControls />
    </div>
  );
}
