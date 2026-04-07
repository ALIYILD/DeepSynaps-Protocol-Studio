import { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <TabList tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      {children}
    </div>
  );
}

export function TabList({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`rounded-2xl px-5 py-2.5 text-sm font-medium transition ${
            activeTab === tab.id
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "bg-[var(--bg-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  id,
  activeTab,
  children,
}: {
  id: string;
  activeTab: string;
  children: ReactNode;
}) {
  if (id !== activeTab) return null;
  return (
    <div role="tabpanel" aria-labelledby={id}>
      {children}
    </div>
  );
}
