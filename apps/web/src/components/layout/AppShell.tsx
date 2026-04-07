import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar />
        <div className="app-surface rounded-[2rem] p-4 md:p-6">
          <TopBar />
          <main className="mt-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
