import { Outlet } from "react-router-dom";

import { DemoControls } from "./DemoControls";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Sidebar />

        {/* Main content panel */}
        <div
          className="app-surface rounded-[2rem] flex flex-col"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="px-6 pt-5">
            <TopBar />
          </div>
          <main id="main-content" className="flex-1 px-6 py-6">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <DemoControls />
    </div>
  );
}
