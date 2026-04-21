export type TabItem = {
  id: string;
  label: string;
};

type TabBarProps = {
  tabs: TabItem[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
};

export function TabBar({ tabs, activeTabId, onTabChange }: TabBarProps) {
  return (
    <div
      className="flex min-w-0 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              "relative shrink-0 px-4 py-2.5 text-sm transition-colors whitespace-nowrap",
              "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:transition-colors",
              isActive
                ? "text-text-primary after:bg-accent"
                : "text-text-secondary hover:text-text-primary after:bg-transparent",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
