import type { ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
  iconOnly?: boolean;
};

type TabBarProps = {
  tabs: TabItem[];
  activeTabId?: string;
  onTabChange: (tabId: string) => void;
  /** When set, each tab button receives `data-testid="${testIdPrefix}-${tab.id}"`. */
  testIdPrefix?: string;
};

export function TabBar({ tabs, activeTabId, onTabChange, testIdPrefix }: TabBarProps) {
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
            aria-label={tab.ariaLabel}
            aria-selected={isActive}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              "relative shrink-0 px-4 py-2.5 text-sm transition-colors whitespace-nowrap",
              "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:transition-colors",
              tab.iconOnly ? "inline-flex h-10 w-10 items-center justify-center px-0" : "",
              isActive
                ? "text-text-primary after:bg-accent"
                : "text-text-secondary hover:text-text-primary after:bg-transparent",
            ].join(" ")}
          >
            {tab.icon ? <span aria-hidden="true">{tab.icon}</span> : null}
            {tab.iconOnly ? <span className="sr-only">{tab.label}</span> : tab.label}
          </button>
        );
      })}
    </div>
  );
}
